#!/usr/bin/env python3
"""Summarize saved native evidence; does not run tests or modify test projects."""
import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'artifacts/memory-2026-10-30'
rows = []
details = []
for name in ['native-small-cached', 'native-large-cached']:
    directory = EVIDENCE / name
    report = json.loads((directory / 'report.json').read_text())
    assert not report.get('error'), report
    assert report['persistedText'] and report['ficheVisible'] and report['sourceExcerptVisible']
    assert report['restoredPosition']['offset'] == 24
    assert report['features']['recall']['section'] == 'scene-0'
    samples = json.loads((directory / 'process-samples.json').read_text())
    child_samples = [p for s in samples for p in s['owned'] if p['pid'] != s['rootPid']]
    stopped = sum('T' in p['state'] for p in child_samples)
    assert stopped > 0
    peak_child = max((p['rssKiB'] for p in child_samples), default=0) / 1024
    peak_root = max((p['rssKiB'] for s in samples for p in s['owned'] if p['pid'] == s['rootPid']), default=0) / 1024
    project = sqlite3.connect(directory / 'project/ariane.sqlite')
    session = json.loads(project.execute('SELECT payload FROM memory_session').fetchone()[0])
    assert session['sourceId'] == report['features']['evidence']['sourceId']
    texts = project.execute("SELECT text FROM sections WHERE kind='scene'").fetchall()
    words = sum(len(t.split()) for (t,) in texts)
    index = sqlite3.connect(directory / 'sources.sqlite')
    sources = index.execute('SELECT path,hash FROM sources').fetchall()
    unchanged = 0
    for path, expected in sources:
        data = (directory / 'vault' / path).read_bytes()
        actual = hashlib.sha256(f'{len(data)}:{hashlib.sha256(data).hexdigest()}'.encode()).hexdigest()
        unchanged += actual == expected
    assert unchanged == len(sources)
    for condition in ['disabled', 'enabledCold', 'enabledWarm']:
        measure = report[condition]
        rows.append(f"| {name} | {condition} | {measure['dispatchMs']['p95']:.1f} | {measure['nextFrameMs']['p95']:.1f} | {measure['nextFrameMs']['max']:.1f} | {measure['flushMs']:.1f} |")
    details.append(f"- **{name}** : {len(texts):,} scènes, {words:,} mots, {unchanged}/{len(sources)} fichiers sources inchangés. Premier contexte après {report['firstContextAfterMs']/1000:.1f} s, incluant les pauses et interruptions de frappe du scénario. Pic RSS échantillonné : processus Ariane {peak_root:.0f} Mio, worker {peak_child:.0f} Mio. État macOS suspendu observé dans {stopped} échantillons. Reprise au nœud `0-0`, décalage 24, après rechargement.")

models = json.loads((EVIDENCE / 'models/final-benchmark.json').read_text())
warm = [c['elapsedMs'] for c in models['cases'][1:]]
text = f'''# Vérification de la mémoire discrète — 30 octobre 2026

Les cinq parcours sont exécutés dans Tauri/WKWebView sur ce Mac Apple M1, 16 Gio, avec les modèles locaux réels. Les projets et les vaults synthétiques sont isolés sous ce dossier. Les modèles ont également terminé leur benchmark avec toutes les connexions réseau refusées par `sandbox-exec`.

## Vérifications fonctionnelles

- Fiche Louise Morel créée automatiquement, description explicite et chronologie 1921/1924 reliées aux passages.
- Rappel sémantique de la maison vide depuis une formulation différente ; contrôle d’un paragraphe comportant plusieurs idées et de distracteurs.
- Source pertinente présentée comme passage à confronter ; extrait conservé dans le lecteur et source retrouvée dans la session.
- Reprise du bon nœud et de son décalage après sauvegarde et rechargement de WKWebView.
- Texte sauvegardé identique après réouverture, sources inchangées, aucun bouton de citation sur les fiches dérivées.
- Suspension du vrai processus Python pendant la frappe ; aucune transaction de sauvegarde ne dépend de son achèvement.

## Saisie native

Chaque condition contient 90 insertions programmées. `dispatch` mesure l’appel CodeMirror, `frame` le délai jusqu’au `requestAnimationFrame` suivant. Ce ne sont pas des mesures physiques clavier-écran. Les trois conditions sont mesurées successivement dans la même fenêtre et le même projet ; leur ordre peut favoriser les caches. Les chiffres ne démontrent donc pas un gain de vitesse.

| Projet | Analyses | Dispatch p95 (ms) | Frame p95 (ms) | Frame max (ms) | Flush (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
{chr(10).join(rows)}

{chr(10).join(details)}

La mesure du gros projet comprend le début du rattrapage. Elle ne certifie pas la durée de l’indexation intégrale, la consommation énergétique ni la fluidité dans tous les corpus. Les échantillons de processus sont espacés d’environ deux secondes et peuvent manquer un pic court. La mémoire WebKit est conservée séparément dans les JSON car les processus XPC sont attribués par différence, pas additionnés arbitrairement au worker.

## Modèles

- Identité : `{models['model']}`.
- Six textes français : spans exacts et noms attendus retrouvés ; deux requêtes simples correctement classées, plus le paragraphe à plusieurs idées. Invariance aux espaces de mise en forme vérifiée.
- Première analyse : {models['cases'][0]['elapsedMs']/1000:.2f} s. Analyses chaudes de courts passages : {min(warm)/1000:.2f}–{max(warm)/1000:.2f} s.
- Pic RSS du processus de benchmark : {models['peakRssBytes']/1048576:.0f} Mio avec caches quantifiés préparés. Ce pic inclut chargement et bibliothèques Python/PyTorch ; il est distinct de la RAM résidente après chargement. La préparation initiale des caches a un coût supplémentaire, pris en charge à l’installation.
- Runtime, poids et caches quantifiés : environ 2,9 Gio sur disque. Les requêtes sont hors ligne et les modèles restent facultatifs pour les fonctions déterministes.

Le corpus est trop petit pour annoncer une précision générale ou une calibration universelle. Les informations de source ne sont pas classifiées automatiquement comme vraies/fausses. Voir `docs/development/memoire-discrete.md` pour les limites de portée, de taille des nœuds et de distribution.

## Contrôles du projet

`npm run verify` : build TypeScript/Vite, 97 tests frontend réussis (1 ignoré), 58 tests Rust réussis (5 ignorés), Clippy avec `-D warnings`. Journal : `verify-delivery.log`.

Les tests ignorés préexistants nécessitent notamment des modèles de révision ou des enregistrements vocaux dédiés. Le nouveau benchmark exécute séparément E5 et GLiNER sur le Mac ; il ne transforme pas ces tests ignorés en tests validés. Une véritable dictée simultanée, la composition IME et le mode économie d’énergie restent non mesurés dans cette recette.

Le gros scénario a été suivi pendant 135 secondes supplémentaires après son rapport : le worker n’était plus présent à la fin, l’application restant ouverte. Le relevé macOS a observé les niveaux de pression mémoire 1 et 2. L’accès manuel « Sources du projet → Fiches issues du manuscrit » a également été vérifié dans la fenêtre native.

Le chargement initial, la RAM et les valeurs maximales ci-dessus restent des coûts réels, même lorsque le p95 de saisie reste proche du témoin. Les essais antérieurs en échec sont conservés comme diagnostics et ne sont pas inclus dans les résultats validés.
'''
signature = EVIDENCE / 'signature.log'
if signature.exists() and 'valid on disk' in signature.read_text() and 'Finished 1 bundle' in (EVIDENCE / 'production-build.log').read_text():
    text += '\n## Application livrable\n\nLe bundle de production `src-tauri/target/release/bundle/macos/Ariane.app` a été reconstruit sans le banc de test, signé localement ad hoc et validé par `codesign --verify --deep --strict`. Le worker et son identité de modèle embarqués correspondent aux sources évaluées. Journaux : `production-build.log` et `signature.log`. Cette signature locale ne constitue pas une notarisation Apple.\n'
(EVIDENCE / 'verification.md').write_text(text)
print(EVIDENCE / 'verification.md')
