// Align the supplied manuscript tokens to synthesized audio with Whisper's
// cross-attention DTW. No speech is transcribed and no user audio is opened.
#include "whisper.h"
#include "common-whisper.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <iterator>
#include <memory>
#include <string>
#include <vector>

static void constrain(whisper_context *ctx, whisper_state *, const whisper_token_data *,
                      int decoded, float *logits, void *data) {
    auto &tokens = *static_cast<std::vector<whisper_token> *>(data);
    auto next = decoded < static_cast<int>(tokens.size()) ? tokens[decoded] : whisper_token_eot(ctx);
    std::fill_n(logits, whisper_n_vocab(ctx), -INFINITY);
    logits[next] = 0;
}

int main(int argc, char **argv) {
    if (argc != 4) return 1;
    std::string text{std::istreambuf_iterator<char>(std::cin), {}};
    std::vector<float> samples;
    std::vector<std::vector<float>> channels;
    if (text.empty() || text.size()>2048 || !read_audio_data(argv[2],samples,channels,false) ||
        samples.empty() || samples.size()>30*WHISPER_SAMPLE_RATE) return 2;
    auto config=whisper_context_default_params();
    config.use_gpu=false;
    config.flash_attn=false;
    config.dtw_token_timestamps=true;
    config.dtw_aheads_preset=WHISPER_AHEADS_TINY;
    std::unique_ptr<whisper_context,decltype(&whisper_free)> ctx(
        whisper_init_from_file_with_params(argv[1],config),whisper_free);
    if (!ctx) return 3;
    std::vector<whisper_token> tokens(220);
    int count=whisper_tokenize(ctx.get(),text.c_str(),tokens.data(),tokens.size());
    if(count<=0 || count>210)return 4;
    tokens.resize(count);
    auto p=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    p.language=argv[3];
    p.n_threads=2;
    p.single_segment=true;
    p.no_context=true;
    p.no_timestamps=true;
    p.no_speech_thold=1;
    p.temperature_inc=0;
    p.print_progress=p.print_realtime=p.print_timestamps=false;
    p.greedy.best_of=1;
    p.logits_filter_callback=constrain;
    p.logits_filter_callback_user_data=&tokens;
    if(whisper_full(ctx.get(),p,samples.data(),samples.size()))return 5;
    size_t offset=0;
    for(int s=0;s<whisper_full_n_segments(ctx.get());s++){
        for(int i=0;i<whisper_full_n_tokens(ctx.get(),s);i++){
            auto token=whisper_full_get_token_data(ctx.get(),s,i);
            if(token.id>=whisper_token_eot(ctx.get()))continue;
            std::string piece=whisper_token_to_str(ctx.get(),token.id);
            if(text.compare(offset,piece.size(),piece)!=0 || token.t_dtw<0)return 6;
            std::cout<<offset<<" "<<token.t_dtw*10<<"\n";
            offset+=piece.size();
        }
    }
    return offset==text.size()?0:7;
}
