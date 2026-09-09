#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, math
from pathlib import Path
from typing import Any

SECTORS = {
    'XLK': ('Information Technology','기술'), 'XLV': ('Health Care','헬스케어'), 'XLF': ('Financials','금융'),
    'XLE': ('Energy','에너지'), 'XLY': ('Consumer Discretionary','자유소비재'), 'XLP': ('Consumer Staples','필수소비재'),
    'XLI': ('Industrials','산업재'), 'XLB': ('Materials','소재'), 'XLC': ('Communication Services','커뮤니케이션'),
    'XLRE': ('Real Estate','부동산'), 'XLU': ('Utilities','유틸리티'),
}

META = {
 'spx': dict(title='S&P 500',group='시장',unit='index',description='미국 대형주 시장의 대표 시가총액 가중 지수.',interpretation='미국 위험선호의 기준선. 낙폭·섹터·신용 지표와 함께 확인.'),
 'ndx': dict(title='Nasdaq 100',group='시장',unit='index',description='나스닥 상장 대형 비금융 기업 중심 지수.',interpretation='성장주·기술주 듀레이션과 위험선호를 확인.'),
 'ixic': dict(title='Nasdaq Composite',group='시장',unit='index',description='나스닥 상장 종목 전반을 포괄하는 지수.',interpretation='장기 낙폭 비교와 기술주 사이클 확인.'),
 'kospi': dict(title='KOSPI',group='한국',unit='index',description='한국 유가증권시장 대표 지수.',interpretation='원화·외국인 수급·반도체 업황과 함께 확인.'),
 'sox': dict(title='Philadelphia Semiconductor',group='시장',unit='index',description='미국 상장 반도체 기업 중심 지수.',interpretation='AI·반도체 자본지출 사이클의 시장 프록시.'),
 'vix': dict(title='VIX',group='시장',unit='index',description='S&P 500 옵션에서 계산되는 기대 변동성 지수.',interpretation='시장 스트레스와 위험회피 강도의 보조 지표.'),
 'usdkrw': dict(title='USD/KRW',group='환율',unit='KRW per USD',description='미 달러 대비 원화 환율.',interpretation='한국 자산의 환산효과·외국인 수급·수입물가 압력을 함께 확인.'),
 'dxy': dict(title='US Dollar Index',group='환율',unit='index',description='주요 통화 대비 달러 강도를 나타내는 지수.',interpretation='글로벌 유동성·원자재·신흥국 위험선호와 교차 확인.'),
 'gold': dict(title='Gold Futures',group='원자재',unit='USD',description='금 선물 가격.',interpretation='실질금리·달러·안전자산 수요와 반대/동행 관계를 비교.'),
 'oil': dict(title='WTI Crude Futures',group='원자재',unit='USD',description='WTI 원유 선물 가격.',interpretation='에너지 물가와 경기·공급 충격을 함께 확인.'),
 'orcl': dict(title='Oracle',group='종목',unit='USD',description='Oracle 주가.',interpretation='AI 인프라·클라우드 투자 사이클의 개별 종목 프록시.'),
 'treasury-2y': dict(title='US 2Y Treasury',group='금리',unit='%',description='미국 2년 만기 국채 상수만기 수익률.',interpretation='정책금리 기대에 민감한 단기 금리.'),
 'treasury-10y': dict(title='US 10Y Treasury',group='금리',unit='%',description='미국 10년 국채 수익률 프록시.',interpretation='명목 장기금리와 성장·인플레·기간프리미엄을 확인.'),
 'real-10y': dict(title='US 10Y Real Yield',group='금리',unit='%',description='미국 10년 TIPS 실질 수익률.',interpretation='장기 실질 할인율. 성장주·금 가격과 함께 확인.'),
 'bei': dict(title='10Y Breakeven Inflation',group='금리',unit='%',description='명목 10년물과 10년 TIPS 차이에서 파생한 기대인플레이션.',interpretation='시장 기반 장기 인플레이션 기대 프록시.'),
 'curve-10y2y': dict(title='10Y-2Y Spread',group='금리',unit='%',description='10년 국채 수익률에서 2년 국채 수익률을 뺀 금리차.',interpretation='수익률곡선 기울기와 정책·경기 기대를 확인.'),
 'hy-oas': dict(title='US High Yield OAS',group='신용',unit='%',description='미국 하이일드 채권의 옵션조정 스프레드.',interpretation='신용 스트레스가 커질수록 대체로 상승.'),
 'credit': dict(title='HYG/LQD Credit Ratio',group='신용',unit='ratio',description='하이일드 ETF HYG와 투자등급 ETF LQD 가격 비율.',interpretation='위험 신용 선호의 시장 가격 기반 보조 지표.'),
 'fed-target': dict(title='Effective Federal Funds Rate',group='연준',unit='%',description='예금기관 간 익일 연방기금 거래의 실효금리.',interpretation='FOMC 정책 범위가 실제 단기시장 금리에 반영되는 수준.'),
 'core-cpi': dict(title='Core CPI YoY',group='물가',unit='%',description='식품·에너지를 제외한 CPI의 전년동월비.',interpretation='기조 인플레이션 압력을 확인.'),
 'unemployment': dict(title='US Unemployment Rate',group='고용',unit='%',description='미국 노동력 중 실업자의 비율(U-3).',interpretation='노동시장 냉각·과열 정도를 확인.'),
 'wages': dict(title='Average Hourly Earnings YoY',group='고용',unit='%',description='미국 민간부문 평균 시간당 임금의 전년동월비.',interpretation='임금발 인플레이션과 노동시장 압력을 보조적으로 확인.'),
}

OFFICIAL = {
 'treasury-2y': ('FRED / Federal Reserve','DGS2','https://fred.stlouisfed.org/series/DGS2'),
 'real-10y': ('FRED / Federal Reserve','DFII10','https://fred.stlouisfed.org/series/DFII10'),
 'bei': ('FRED','T10YIE','https://fred.stlouisfed.org/series/T10YIE'),
 'curve-10y2y': ('FRED','T10Y2Y','https://fred.stlouisfed.org/series/T10Y2Y'),
 'hy-oas': ('FRED / ICE BofA','BAMLH0A0HYM2','https://fred.stlouisfed.org/series/BAMLH0A0HYM2'),
 'fed-target': ('FRED / Federal Reserve','DFF','https://fred.stlouisfed.org/series/DFF'),
 'core-cpi': ('FRED / BLS','CPILFESL derived YoY','https://fred.stlouisfed.org/series/CPILFESL'),
 'unemployment': ('FRED / BLS','UNRATE','https://fred.stlouisfed.org/series/UNRATE'),
 'wages': ('FRED / BLS','CES0500000003 derived YoY','https://fred.stlouisfed.org/series/CES0500000003'),
}

SNAPSHOT_AUTO = {'spx','ndx','kospi','sox','vix','usdkrw','dxy','gold','oil','orcl','treasury-10y'}

YAHOO_SYMBOLS = {
 'spx':'^GSPC','ndx':'^NDX','ixic':'^IXIC','kospi':'^KS11','sox':'^SOX','vix':'^VIX','usdkrw':'KRW=X','dxy':'DX-Y.NYB','gold':'GC=F','oil':'CL=F','orcl':'ORCL','treasury-10y':'^TNX','credit':'HYG/LQD derived'
}

SPECIAL = [
 dict(id='foreign-flow',title='한국 투자자별 순매수',group='한국',provider='원본 스냅샷 / 한국시장 데이터',symbol='investor-flow',frequency='daily',unit='억원',status='cached',path='data/macro/investor-flow__from=2026-01-01.json',description='외국인·개인·기관 일별 순매수. 제공된 원본 캐시를 보존.',analysis=['외국인 수급']),
 dict(id='foreign-share',title='외국인 보유비중',group='한국',provider='원본 스냅샷',symbol='foreign-share',frequency='quarterly',unit='%',status='cached',path='data/macro/foreign-share__from=2003-01-01.json',description='한국시장 외국인 보유비중 장기 분기 자료와 일별 순매수.',analysis=['외국인 수급','장기 이력']),
 dict(id='semi-export',title='한국 반도체 수출',group='한국',provider='원본 스냅샷 / 관세청 계열',symbol='semi-export',frequency='monthly',unit='USD',status='cached',path='data/macro/semi-export__from=2020-01.json',description='월별 반도체 수출·수입·무역수지.',analysis=['한국 관측']),
 dict(id='drawdown-spx',title='S&P 500 폭락 이력',group='분석',provider='MacroDeck derived',symbol='SPX drawdown',frequency='daily',unit='%',status='derived',path='data/macro/drawdown__from=1985-01-01&symbol=_5eGSPC.json',description='전고점 대비 낙폭과 -10% 이상 하락 에피소드.',analysis=['폭락 이력']),
 dict(id='drawdown-ixic',title='Nasdaq Composite 폭락 이력',group='분석',provider='MacroDeck derived',symbol='IXIC drawdown',frequency='daily',unit='%',status='derived',path='data/macro/drawdown__from=1985-01-01&symbol=_5eIXIC.json',description='전고점 대비 낙폭과 -10% 이상 하락 에피소드.',analysis=['폭락 이력']),
 dict(id='sector-composition',title='S&P 500 섹터 구성비',group='섹터',provider='원본 앵커 + ETF 가격 근사',symbol='GICS 11 sectors',frequency='daily approx',unit='%',status='derived',path='data/sectors/composition.json',description='원본 시가총액 앵커에서 섹터 ETF 상대가격으로 연장한 근사 구성비.',analysis=['섹터 로테이션']),
 dict(id='sector-composition-history',title='S&P 500 섹터 구성비 시계열',group='섹터',provider='원본/파생 캐시 + MacroDeck',symbol='GICS 11 sectors',frequency='daily approx',unit='%',status='derived',path='data/sectors/composition/history.json',description='섹터 구성비 가격 기반 근사 시계열.',analysis=['섹터 로테이션']),
 dict(id='sector-perf',title='미국 섹터 성과',group='섹터',provider='Yahoo Finance chart',symbol='XLK/XLV/...',frequency='daily',unit='%',status='auto',path='data/sectors/perf.json',description='S&P 500 11개 섹터 ETF의 기간별 성과.',analysis=['섹터 로테이션','리더보드']),
 dict(id='sector-rrg',title='섹터 RRG',group='섹터',provider='MacroDeck derived',symbol='sector ETFs vs SPX',frequency='weekly derived',unit='RS',status='derived',path='data/sectors/rrg__tail=10.json',description='S&P 500 대비 상대강도와 모멘텀을 100 중심 좌표로 근사.',analysis=['섹터 로테이션','RRG']),
]


def load(path: Path, default: Any):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except Exception: return default

def dump(path: Path, obj: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+"\n", encoding='utf-8')

def rows(data_dir: Path, sid: str):
    p=load(data_dir/'history'/f'{sid}.json',{})
    return [r for r in p.get('series',[]) if r.get('date') and isinstance(r.get('value'),(int,float))]

def weekly(series):
    out={}
    for r in series:
        try:
            d=dt.date.fromisoformat(str(r['date'])[:10])
        except: continue
        y,w,_=d.isocalendar(); out[f'{y}-{w:02d}']=r
    return list(out.values())

def calc_returns(series):
    if len(series)<2: return {k:0 for k in ['d1','w1','m1','m3','m6','ytd','y1']}
    vals=[float(r['value']) for r in series]; last=vals[-1]
    def ret(n):
        b=vals[max(0,len(vals)-1-n)]; return 0 if b==0 else last/b-1
    year=str(series[-1]['date'])[:4]
    idx=next((i for i,r in enumerate(series) if str(r['date']).startswith(year)),0); b=vals[idx]
    return {'d1':ret(1),'w1':ret(5),'m1':ret(21),'m3':ret(63),'m6':ret(126),'ytd':0 if b==0 else last/b-1,'y1':ret(252)}

def mean(a): return sum(a)/len(a) if a else 0

def stdev(a):
    if len(a)<2: return 0
    m=mean(a); return math.sqrt(sum((x-m)**2 for x in a)/len(a))

def rrg_series(sector, bench, tail=10, window=14):
    sm={str(r['date'])[:10]:float(r['value']) for r in sector}; bm={str(r['date'])[:10]:float(r['value']) for r in bench}
    common=[{'date':d,'s':sm[d],'b':bm[d]} for d in sorted(set(sm)&set(bm)) if bm[d]]
    wk={}
    for r in common:
        d=dt.date.fromisoformat(r['date']); y,w,_=d.isocalendar(); wk[f'{y}-{w:02d}']=r
    seq=list(wk.items())
    if len(seq)<window+3: return []
    logrs=[math.log(v['s']/v['b']) for _,v in seq]
    raw=[]
    for i in range(window, len(seq)):
        w=logrs[i-window+1:i+1]; sd=stdev(w) or 1e-9
        ratio=100 + (logrs[i]-mean(w))/sd*1.25
        diffs=[logrs[j]-logrs[j-1] for j in range(max(1,i-window+1),i+1)]
        ds=stdev(diffs) or 1e-9
        momentum=100 + ((logrs[i]-logrs[i-1])-mean(diffs))/ds*1.25
        q='leading' if ratio>=100 and momentum>=100 else 'weakening' if ratio>=100 else 'improving' if momentum>=100 else 'lagging'
        key,v=seq[i]
        raw.append({'week':key,'date':v['date'],'rsRatio':ratio,'rsMomentum':momentum,'quadrant':q})
    return raw[-tail:]

def update_sector(data_dir: Path):
    # Perf from stored histories
    items=[]
    for sym,(eng,ko) in SECTORS.items():
        sr=rows(data_dir,f'sector-{sym.lower()}')
        if sr: items.append({'symbol':sym,'name':ko,'returns':calc_returns(sr)})
    if items:
        spx=rows(data_dir,'spx')
        dump(data_dir/'sectors/perf.json', {'benchmark':{'symbol':'^GSPC','returns':calc_returns(spx)},'sectors':items,'source':'Yahoo Finance chart · local history','updatedAt':dt.datetime.now(dt.timezone.utc).isoformat()})

    # Sector RRG auto refresh; sub-sector files remain provided-cache and are clearly labeled in UI.
    spx=rows(data_dir,'spx')
    if spx:
        for tail in (6,10,14):
            sectors=[]
            for sym,(eng,ko) in SECTORS.items():
                tail_rows=rrg_series(rows(data_dir,f'sector-{sym.lower()}'),spx,tail=tail)
                if tail_rows:
                    sectors.append({'symbol':sym,'name':ko,'tail':tail_rows,'current':tail_rows[-1],'weeks':len(weekly(rows(data_dir,f'sector-{sym.lower()}')))})
            if sectors:
                dump(data_dir/'sectors'/f'rrg__tail={tail}.json', {'benchmark':'^GSPC','window':14,'tail_weeks':tail,'sectors':sectors,'source':'MacroDeck derived · sector ETF vs S&P 500','updatedAt':dt.datetime.now(dt.timezone.utc).isoformat()})

    # Extend market-cap composition using the original exact-ish snapshot as a fixed anchor and sector ETF price ratios.
    anchor=load(data_dir/'sectors/composition-anchor.json',{})
    if not anchor.get('sectors'): return
    anchor_date=str(anchor.get('meta',{}).get('prices_asof') or '')[:10]
    if not anchor_date: return
    base_by_eng={x['sector']:x for x in anchor['sectors']}
    price_by_sector={}
    latest_date=None
    for sym,(eng,ko) in SECTORS.items():
        sr=rows(data_dir,f'sector-{sym.lower()}')
        if not sr: continue
        base=min(sr, key=lambda r: abs((dt.date.fromisoformat(str(r['date'])[:10])-dt.date.fromisoformat(anchor_date)).days))
        latest=sr[-1]
        if base['value']:
            price_by_sector[eng]=(float(latest['value'])/float(base['value']), str(latest['date'])[:10])
            latest_date=max(latest_date or str(latest['date'])[:10], str(latest['date'])[:10])
    raw=[]
    for eng,base in base_by_eng.items():
        ratio=price_by_sector.get(eng,(1,None))[0]
        raw.append((eng,float(base.get('weight',0))*ratio,base))
    total=sum(x[1] for x in raw) or 1
    current=[]
    for eng,val,base in raw:
        current.append({**base,'weight':val/total,'marketcap':None})
    comp={**anchor,'sectors':current,'total_marketcap':None,'source':'원본 시가총액 앵커 + 섹터 ETF 가격비 근사','estimated':True,'meta':{**anchor.get('meta',{}),'anchor_prices_asof':anchor_date,'prices_asof':latest_date or anchor_date,'note':'원본 구성비를 고정 앵커로 두고 섹터 ETF 가격비로 이후 변화만 연장한 근사치. 구성종목/주식수 변화는 반영하지 않음.'}}
    dump(data_dir/'sectors/composition.json',comp)

    hist=load(data_dir/'sectors/composition/history.json',{'from':anchor_date,'rows':[],'sectors':[]})
    existing={r['date']:r for r in hist.get('rows',[]) if r.get('date')}
    # Extend only from anchor forward on common business dates.
    daily_maps={}
    for sym,(eng,ko) in SECTORS.items(): daily_maps[eng]={str(r['date'])[:10]:float(r['value']) for r in rows(data_dir,f'sector-{sym.lower()}')}
    dates=sorted(set().union(*[set(m) for m in daily_maps.values()])) if daily_maps else []
    for date in dates:
        if date<=anchor_date: continue
        vals={}
        for eng,base in base_by_eng.items():
            m=daily_maps.get(eng,{})
            if date not in m: continue
            candidates=[d for d in m if d<=anchor_date]
            if not candidates: continue
            bd=max(candidates); b=m[bd]
            if b: vals[eng]=float(base.get('weight',0))*m[date]/b
        if len(vals)<8: continue
        t=sum(vals.values()) or 1
        existing[date]={'date':date,**{eng:vals.get(eng,0)/t for eng in base_by_eng}}
    hist['rows']=[existing[k] for k in sorted(existing)]
    hist['source']='원본/파생 캐시 + MacroDeck 가격 기반 연장 근사'; hist['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    dump(data_dir/'sectors/composition/history.json',hist)

def drawdown_payload(series, symbol, name):
    series=[r for r in series if str(r['date'])[:10]>='1985-01-01']
    peak=-math.inf; peak_date=''; current=None; episodes=[]; dd=[]
    # daily episodes; threshold -10%
    in_dd=False; ep=None
    for r in series:
        v=float(r['value']); d=str(r['date'])[:10]
        if v>=peak:
            if in_dd and ep:
                # recovery at new high
                ep['recovery_date']=d
                ep['recovery_days']=(dt.date.fromisoformat(d)-dt.date.fromisoformat(ep['trough_date'])).days
                ep['ongoing']=False
                if ep['depth']<=-0.10: episodes.append(ep)
            peak=v; peak_date=d; in_dd=False; ep=None
            ddv=0.0
        else:
            ddv=v/peak-1 if peak else 0
            if not in_dd:
                in_dd=True; ep={'peak_date':peak_date,'peak_value':peak,'trough_date':d,'trough_value':v,'depth':ddv,'decline_days':(dt.date.fromisoformat(d)-dt.date.fromisoformat(peak_date)).days,'recovery_date':None,'recovery_days':None,'ongoing':True}
            elif ddv<ep['depth']:
                ep['trough_date']=d; ep['trough_value']=v; ep['depth']=ddv; ep['decline_days']=(dt.date.fromisoformat(d)-dt.date.fromisoformat(peak_date)).days
        dd.append({'date':d,'close':v,'drawdown':ddv})
    if in_dd and ep and ep['depth']<=-0.10: episodes.append(ep)
    # weekly-ish display points
    sampled=[]; last_week=None
    for r in dd:
        d=dt.date.fromisoformat(r['date']); wk=d.isocalendar()[:2]
        if wk!=last_week:
            sampled.append(r); last_week=wk
        else: sampled[-1]=r
    return {'symbol':symbol,'name':name,'series':sampled,'episodes':sorted(episodes,key=lambda x:x['depth']),'max_drawdown':min((x['drawdown'] for x in dd),default=0),'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'source':'MacroDeck derived from local daily history'}

def update_drawdowns(data_dir: Path):
    spx=rows(data_dir,'spx'); ixic=rows(data_dir,'ixic')
    if spx: dump(data_dir/'macro/drawdown__from=1985-01-01&symbol=_5eGSPC.json',drawdown_payload(spx,'^GSPC','S&P 500'))
    if ixic: dump(data_dir/'macro/drawdown__from=1985-01-01&symbol=_5eIXIC.json',drawdown_payload(ixic,'^IXIC','나스닥 종합'))

def infer_special_stats(data_dir:Path,item):
    p=data_dir/item['path'].replace('data/','')
    d=load(p,{})
    pts=0; first=''; last=''
    if item['id']=='foreign-flow':
        r=d.get('rows',[]); pts=len(r); dates=[x.get('date') for x in r if x.get('date')]
    elif item['id']=='foreign-share':
        r=d.get('share',[]); pts=len(r)+len(d.get('netbuy',[])); dates=[x.get('quarter') for x in r if x.get('quarter')]
    elif item['id']=='semi-export':
        r=d.get('series',[]); pts=len(r); dates=[x.get('month') for x in r if x.get('month')]
    elif item['id'].startswith('drawdown'):
        r=d.get('series',[]); pts=len(r); dates=[x.get('date') for x in r if x.get('date')]
    elif item['id']=='sector-composition-history':
        r=d.get('rows',[]); pts=len(r); dates=[x.get('date') for x in r if x.get('date')]
    else:
        dates=[]
    if dates: first=min(dates); last=max(dates)
    return pts,first,last

def build_library(data_dir: Path):
    items=[]
    for p in sorted((data_dir/'history').glob('*.json')):
        if p.name=='catalog.json': continue
        d=load(p,{})
        sid=d.get('id') or p.stem; sr=d.get('series',[])
        if not sr: continue
        m=META.get(sid,{})
        provider,symbol,url=OFFICIAL.get(sid,(d.get('source','Yahoo Finance chart'),d.get('sourceSymbol') or YAHOO_SYMBOLS.get(sid,''),''))
        status='derived' if 'derived' in str(d.get('source','')).lower() else 'auto'
        if str(d.get('source','')).startswith('legacy'): status='seeded'
        items.append({
          'id':sid,'title':m.get('title',d.get('name',sid)),'group':m.get('group','섹터' if sid.startswith('sector-') else '기타'),'provider':provider,
          'symbol':symbol,'sourceUrl':url,'frequency':d.get('frequency','daily'),'unit':m.get('unit',''),'status':status,'path':f'data/history/{p.name}',
          'points':len(sr),'first':str(sr[0].get('date','')),'last':str(sr[-1].get('date','')),'description':m.get('description',d.get('name','')),
          'interpretation':m.get('interpretation',''),'analysis':['모니터','장기 이력'] if not sid.startswith('sector-') else ['섹터 로테이션','RRG'],
          'refresh':(
              '30분 snapshot + 일별 병합 + 주간 전체 백필' if sid in SNAPSHOT_AUTO else
              '일별 HYG/LQD 재계산 + 주간 전체 백필' if sid == 'credit' else
              '일별 Yahoo 병합 + 주간 전체 백필' if sid in YAHOO_SYMBOLS else
              f"매일 FRED 확인 · 원자료 {d.get('frequency','daily')}" if sid in OFFICIAL else
              '일별 섹터 ETF 갱신'
          )
        })
    for x in SPECIAL:
        pts,first,last=infer_special_stats(data_dir,x)
        items.append({**x,'points':pts,'first':first,'last':last,'refresh':'기존 원본 캐시 보존' if x['status']=='cached' else '수집 데이터에서 자동 재계산'})
    groups={}
    for x in items: groups[x['group']]=groups.get(x['group'],0)+1
    payload={'schemaVersion':1,'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'count':len(items),'groups':groups,'items':items,
      'statusLegend':{'auto':'외부 공개 데이터에서 자동 갱신','derived':'자동 수집된 데이터에서 재계산','seeded':'원본 기초자료를 시드로 사용, 다음 백필에서 확장','cached':'사용자가 제공한 원본 캐시; 자동 공급원 미연결'}}
    dump(data_dir/'reference/indicator-library.json',payload)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--data-dir',default='public/data'); args=ap.parse_args(); d=Path(args.data_dir)
    update_sector(d); update_drawdowns(d); build_library(d)
    print('Derived analytics and indicator library refreshed.')
if __name__=='__main__': main()
