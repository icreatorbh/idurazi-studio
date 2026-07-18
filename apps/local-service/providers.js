const path=require('node:path');
const {ProviderContainer}=require('@idurazi/provider-container');
const {OllamaProvider}=require('@idurazi/provider-ai-ollama');
const {FasterWhisperProvider}=require('@idurazi/provider-transcription-faster-whisper');
const {JsonStorageProvider}=require('@idurazi/provider-storage-json');
const {FfmpegProvider}=require('@idurazi/provider-media-ffmpeg');
function createProviders(config){const root=path.resolve(__dirname,'../..');return new ProviderContainer()
.register('ai',new OllamaProvider({baseUrl:config.ollamaUrl,defaultModel:config.defaultModel,timeoutMs:config.requestTimeoutMs}))
.register('transcription',new FasterWhisperProvider({python:config.whisperPython||'python',script:path.join(__dirname,'python','transcribe.py'),outputDir:path.resolve(__dirname,config.transcriptionOutputDir||'outputs')}))
.register('storage',new JsonStorageProvider({rootDir:path.join(root,'database')}))
.register('media',new FfmpegProvider({ffprobe:config.ffprobePath||'ffprobe'}));}
module.exports={createProviders};
