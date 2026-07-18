import argparse,json,os,sys
from pathlib import Path
from faster_whisper import WhisperModel

def fmt_srt(t):
 h=int(t//3600);m=int((t%3600)//60);s=int(t%60);ms=int(round((t-int(t))*1000));return f"{h:02}:{m:02}:{s:02},{ms:03}"
def fmt_vtt(t): return fmt_srt(t).replace(',', '.')

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output-dir',required=True);ap.add_argument('--model',default='small');ap.add_argument('--language',default='auto');ap.add_argument('--device',default='auto');ap.add_argument('--compute-type',default='auto');args=ap.parse_args()
 inp=Path(args.input);out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
 model=WhisperModel(args.model,device=args.device,compute_type=args.compute_type)
 segs,info=model.transcribe(str(inp),language=None if args.language=='auto' else args.language,beam_size=5,vad_filter=True)
 items=[]
 for i,s in enumerate(segs,1): items.append({'id':i,'start':round(s.start,3),'end':round(s.end,3),'text':s.text.strip()})
 stem=inp.stem; text='\n'.join(x['text'] for x in items)
 data={'source':str(inp),'language':getattr(info,'language',None),'languageProbability':getattr(info,'language_probability',None),'duration':getattr(info,'duration',None),'segments':items,'text':text}
 paths={}
 jp=out/f'{stem}.json';jp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');paths['json']=str(jp)
 tp=out/f'{stem}.txt';tp.write_text(text,encoding='utf-8');paths['txt']=str(tp)
 sp=out/f'{stem}.srt';sp.write_text('\n\n'.join(f"{x['id']}\n{fmt_srt(x['start'])} --> {fmt_srt(x['end'])}\n{x['text']}" for x in items),encoding='utf-8');paths['srt']=str(sp)
 vp=out/f'{stem}.vtt';vp.write_text('WEBVTT\n\n'+'\n\n'.join(f"{fmt_vtt(x['start'])} --> {fmt_vtt(x['end'])}\n{x['text']}" for x in items),encoding='utf-8');paths['vtt']=str(vp)
 data['files']=paths;print(json.dumps(data,ensure_ascii=False))
if __name__=='__main__':
 try: main()
 except Exception as e: print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)
