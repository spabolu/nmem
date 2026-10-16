import json, random, subprocess, os, collections
R=os.path.expanduser('~/.cache/nmem/repos')
repos=['mozilla-ai/agent-factory','apple/swift-argument-parser','square/javapoet','expressjs/body-parser','rack/rack-attack','mat/besticon']
rows=[]
for r in repos:
    ws=f'{R}/{r}'
    s=json.load(open(f'{ws}/snapshot.json')); g=json.load(open(f'{ws}/github.json'))
    pulls={f"pr#{p['number']}":p['title'] for p in g['pulls']}
    per=collections.Counter(d['carriedBy'] for d in s['decisions'])
    rnd=random.Random(20261015); pick=rnd.sample(s['decisions'],min(35,len(s['decisions'])))
    for d in pick:
        cb=d['carriedBy']
        if cb and cb.startswith('pr#'): title=pulls.get(cb,'')
        elif cb: title=subprocess.run(['git','-C',f'{ws}/repo','log','-1','--format=%s',cb],capture_output=True,text=True).stdout.strip()
        else: title='(not carried by any change; agreed or declined in a thread)'
        why=d['why']; reason=why['reason']['eng'] if why['kind']=='recorded' else None
        rows.append({'key':f"{r}#{d['id']}",'repo':r,'change':cb,'changeTitle':title,'decisionsInSameChange':per[cb],'decision':d['what']['eng'],'quote':d['what']['source']['quote'][:400],'quoteFrom':d['what']['source']['ref'],'recordedReason':reason})
with open('sample.jsonl','w') as f:
    for x in rows: f.write(json.dumps(x)+'\n')
print(len(rows)); 
for r in repos:
    s=json.load(open(f'{R}/{r}/snapshot.json')); print(r, len(s['decisions']), 'decisions /', len(s['changes']), 'changes')
