#!/usr/bin/env python3
"""Offline JSON-lines inference for Ariane's derived manuscript memory.

Offsets are Python Unicode codepoint indices, with an exclusive end. The caller
must convert them to UTF-16 before applying them to CodeMirror.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import re
from pathlib import Path
import sys
import time

# Set these before importing any model library. Both models must already exist.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

MODEL_ID = Path(__file__).with_name("memory-model.txt").read_text().strip()
MAX_TEXT_CHARS = 65536
E5_MAX_TOKENS = 512
NER_MODEL_ID = "fastino/gliner2-multi-v1@ce747d7+qnnpack-v3:entities-v4"
POLICY = json.loads(Path(__file__).with_name("ai-policy.json").read_text())
LABELS = ("person", "location", "organization", "work", "event")


class MemoryEngine:
    def __init__(self, root: Path):
        self.root = root
        self.kind = None
        self.model = None
        self.tokenizer = None
        self.e5_cache = None
        self.gliner_cache = None

    def cache_key(self):
        import torch
        manifest = (self.root / "manifest.json").read_bytes()
        return hashlib.sha256(manifest + MODEL_ID.encode() + torch.__version__.encode()).hexdigest()

    def cached(self, name):
        import torch
        torch.backends.quantized.engine = "qnnpack"
        path = self.root / "quantized" / (name + ".pt")
        receipt = path.with_suffix(".json")
        if not path.is_file() or not receipt.is_file():
            return None
        try:
            metadata = json.loads(receipt.read_text())
            if metadata["key"] != self.cache_key():
                return None
            with path.open("rb") as file:
                if hashlib.file_digest(file, "sha256").hexdigest() != metadata["sha256"]:
                    return None
            # This is an integrity-checked cache generated locally below, never
            # a downloaded pickle. Source model downloads remain safetensors.
            model = torch.load(path, map_location="cpu", weights_only=False)
            if name == "gliner":
                from functools import lru_cache
                model.processor._tokenize_cached = lru_cache(maxsize=50_000)(model.processor.tokenizer.tokenize)
            return model
        except Exception as exc:
            print(f"Rebuilding local quantized cache: {exc}", file=sys.stderr)
            return None

    def remember(self, name, model):
        import torch
        directory = self.root / "quantized"
        directory.mkdir(exist_ok=True)
        path = directory / (name + ".pt")
        temporary = directory / (name + ".tmp")
        cache = None
        if name == "gliner":
            # This deterministic per-process LRU is not serializable. Recreate
            # it after loading; it does not contain learned parameters.
            cache = model.processor._tokenize_cached
            del model.processor._tokenize_cached
        try:
            torch.save(model, temporary)
        finally:
            if cache is not None:
                model.processor._tokenize_cached = cache
        with temporary.open("rb") as file:
            digest = hashlib.file_digest(file, "sha256").hexdigest()
        temporary.replace(path)
        path.with_suffix(".json").write_text(json.dumps({"key": self.cache_key(), "sha256": digest}))

    def quantize(self, model, embeddings=False):
        import torch
        from torch.ao.quantization import quantize_dynamic, default_dynamic_qconfig, float_qparams_weight_only_qconfig
        torch.backends.quantized.engine = "qnnpack"
        model.eval()
        config = {torch.nn.Linear: default_dynamic_qconfig}
        # DeBERTa reads relative_embeddings.weight directly: replacing that
        # embedding with a quantized module would turn the tensor into a method.
        if embeddings:
            config[torch.nn.Embedding] = float_qparams_weight_only_qconfig
        else:
            config["embeddings.word_embeddings"] = float_qparams_weight_only_qconfig
        return quantize_dynamic(model, config, inplace=True)

    def unload(self) -> None:
        self.model = None
        self.tokenizer = None
        self.kind = None
        self.e5_cache = None
        self.gliner_cache = None
        gc.collect()

    def e5(self):
        if self.e5_cache is None:
            import torch
            from transformers import AutoModel, AutoTokenizer
            torch.set_num_threads(int(os.environ.get("ARIANE_NER_THREADS", "2")) if os.environ.get("ARIANE_NER_THREADS", "2") in ("1", "2", "4") else 1)
            self.e5_cache = self.cached("e5")
            if self.e5_cache is not None:
                return self.e5_cache
            path = self.root / "models/e5"
            tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True)
            model = self.quantize(AutoModel.from_pretrained(path, local_files_only=True), embeddings=True)
            self.e5_cache = (model, tokenizer)
            self.remember("e5", self.e5_cache)
            gc.collect()
        return self.e5_cache

    def gliner(self):
        if self.gliner_cache is None:
            import torch
            from gliner2 import AutoExtractor
            torch.set_num_threads(int(os.environ.get("ARIANE_NER_THREADS", "2")) if os.environ.get("ARIANE_NER_THREADS", "2") in ("1", "2", "4") else 1)
            self.gliner_cache = self.cached("gliner")
            if self.gliner_cache is not None:
                return self.gliner_cache
            self.gliner_cache = AutoExtractor.from_pretrained(str(self.root / "models/gliner"), map_location="cpu")
            # The span head slices Linear.weight itself; quantize only the
            # transformer, whose Linear layers use the ordinary forward API.
            self.quantize(self.gliner_cache.encoder)
            self.remember("gliner", self.gliner_cache)
            gc.collect()
        return self.gliner_cache

    def embed(self, text: str, role: str = "passage") -> list[float]:
        import torch
        import torch.nn.functional as functional

        # Formatting whitespace is not a semantic signal. Keep the original
        # text untouched for span extraction and provenance.
        text = re.sub(r"\s+", " ", text).strip()
        text = re.sub(r"\s+([.,!?])", r"\1", text)
        model, tokenizer = self.e5()
        encoded = tokenizer(role + ": " + text, return_tensors="pt", truncation=False)
        if encoded["input_ids"].shape[1] > E5_MAX_TOKENS:
            # Keep every token; aggregate bounded windows instead of truncating prose.
            ids = encoded["input_ids"][0]
            vectors = []
            for start in range(0, len(ids), 384):
                piece = tokenizer.decode(ids[start:start + 384], skip_special_tokens=True)
                vectors.append(torch.tensor(self.embed(piece, role)))
            vector = functional.normalize(torch.stack(vectors).mean(dim=0), p=2, dim=0)
            return vector.tolist()
        with torch.inference_mode():
            output = model(**encoded).last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1).bool()
            pooled = output.masked_fill(~mask, 0.0).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
            vector = functional.normalize(pooled, p=2, dim=1)[0]
        return [float(value) for value in vector.tolist()]

    def entities(self, text: str) -> list[dict]:
        extractor = self.gliner()
        # The long API partitions by words and maps spans to the original text.
        # A regular extract_entities call can silently truncate at max_len.
        result = extractor.extract_entities_long(
            text, list(LABELS), threshold=0.5, chunk_size=256,
            chunk_overlap=32, batch_size=int(os.environ.get("ARIANE_NER_BATCH", "1")) if os.environ.get("ARIANE_NER_BATCH", "1") in ("1", "2", "4") else 1, num_workers=0,
            include_confidence=True, include_spans=True,
        )
        found = []
        for label, entries in result.get("entities", {}).items():
            if label not in LABELS:
                continue
            for item in entries:
                start, end = item.get("start"), item.get("end")
                mention = item.get("text")
                if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start < end <= len(text) or text[start:end] != mention:
                    print("Skipping GLiNER span that does not match source text", file=sys.stderr, flush=True)
                    continue
                score = float(item.get("confidence", 0.0))
                found.append({"text": mention, "label": label, "start": start, "end": end, "score": score})
        found.sort(key=lambda item: (item["start"], item["end"], item["label"]))
        return found

    def run(self, request: dict) -> dict:
        request_id = request.get("id")
        operation = request.get("operation")
        text = request.get("text")
        role = request.get("role", "passage")
        if operation == "classify_note":
            title = request.get("title")
            types = request.get("types")
            if not isinstance(title, str) or not title.strip() or len(title)>120 or not isinstance(types,list) or not 1<=len(types)<=64:
                raise ValueError("Classification de note invalide.")
            labels = {}
            for item in types:
                name, description, examples = item.get("name"), item.get("description", ""), item.get("examples", [])
                if not isinstance(name,str) or not name.strip() or len(name)>60 or not isinstance(description,str) or len(description)>500 or not isinstance(examples,list) or len(examples)>30 or any(not isinstance(e,str) or len(e)>120 for e in examples):
                    raise ValueError("Définition de type invalide.")
                labels[name] = description + (" Exemples : " + ", ".join(examples) if examples else "")
            labels["Note"] = "Une note générale ou une entité dont le type est inconnu ou ambigu."
            context = text if isinstance(text,str) else ""
            # A quick-note title is often typed in lowercase. Normalize only the
            # classifier input; preserve the user's title and file byte-for-byte.
            title = title.title() if title.islower() else title
            # Keep this input as note metadata. Instruction-like prefixes weakened
            # short-name predictions in the installed multilingual classifier.
            sample = "Nom : " + title + "." + (" Contexte : " + context[:1000] if context else "")
            start = time.perf_counter()
            result = self.gliner().classify_text(sample,{"type":{"labels":labels,"multi_label":True,"cls_threshold":0,"top_k":3}},include_confidence=True)
            return {"id":request_id,"classification":result,"elapsedMs":round((time.perf_counter()-start)*1000,2)}
        if operation not in ("embed", "analyze", "entities"):
            raise ValueError("operation doit valoir 'embed', 'analyze' ou 'entities'.")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text doit être une chaîne non vide.")
        if role not in ("query", "passage"):
            raise ValueError("role doit valoir 'query' ou 'passage'.")
        if len(text) > MAX_TEXT_CHARS:
            raise ValueError(f"Le passage dépasse {MAX_TEXT_CHARS} caractères Unicode ; le découper sans perte.")
        start = time.perf_counter()
        if operation == "entities":
            found = self.entities(text)
            types = request.get("types", [])
            # Classify only extracted spans; custom types do not invent boundaries.
            if isinstance(types, list) and types:
                for item in [span for span in found if span["score"] >= POLICY["ner"]["custom"] and span["text"].strip() and len(span["text"]) <= 120][:4]:
                    result = self.run({"operation":"classify_note", "title":item["text"], "text":text[max(0,item["start"]-120):item["end"]+120], "types":types})
                    item["baseLabel"] = item["label"]
                    item["classification"] = result.get("classification", {})
                    choices = result.get("classification",{}).get("type",[])
                    if choices and choices[0].get("confidence",0)>=POLICY["classification"]["score"] and choices[0].get("confidence",0)-(choices[1].get("confidence",0) if len(choices)>1 else 0)>=POLICY["classification"]["margin"]:
                        kind=choices[0].get("label")
                        if kind in {t.get("name") for t in types} and kind not in ("Personne","Lieu","Organisation","Œuvre","Événement"):
                            item["label"]="custom:"+kind
            return {"id": request_id, "entities": found, "model": NER_MODEL_ID,
                    "elapsedMs": round((time.perf_counter() - start) * 1000, 2)}
        vector = self.embed(text, role if operation == "embed" else "passage")
        response = {"id": request_id, "vector": vector, "model": MODEL_ID}
        if operation == "analyze":
            response["queryVector"] = self.embed(text, "query")
            # A paragraph can contain several ideas. Preserve those signals
            # instead of letting a name/date drown out its following image.
            sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
            stride = max(1, (len(sentences) + 7) // 8)
            pieces = [" ".join(sentences[i:i + stride]) for i in range(0, len(sentences), stride)]
            response["passageVectors"] = [vector]
            response["queryVectors"] = [response["queryVector"]]
            if len(pieces) > 1:
                response["passageVectors"].extend(self.embed(piece) for piece in pieces)
                response["queryVectors"].extend(self.embed(piece, "query") for piece in pieces)
            response["entities"] = self.entities(text)
        response["elapsedMs"] = round((time.perf_counter() - start) * 1000, 2)
        return response


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True, help="Installed Ariane memory root")
    parser.add_argument("--prepare", action="store_true", help="Build local quantized caches before first use")
    args = parser.parse_args()
    engine = MemoryEngine(args.root)
    if args.prepare:
        engine.gliner()
        return
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("La requête doit être un objet JSON.")
            request_id = request.get("id")
            response = engine.run(request)
        except Exception as exc:
            print(f"Memory request failed: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
            response = {"id": request_id, "error": {"code": type(exc).__name__, "message": str(exc)}}
        print(json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
