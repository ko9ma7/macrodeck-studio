#!/usr/bin/env python3
"""Seed canonical data/history/*.json from the legacy chart files already in the repo.
Safe to rerun: rows are deduplicated by date. This does not access the network.
"""
from __future__ import annotations
import argparse, datetime as dt, json, pathlib

MAPPING = {
    'core-cpi': ('macro/chart__days=730&symbol=CPICORE.json','Core CPI YoY','legacy snapshot','CPICORE','monthly'),
    'unemployment': ('macro/chart__days=730&symbol=UNEMP.json','US Unemployment Rate','legacy snapshot','UNEMP','monthly'),
    'wages': ('macro/chart__days=730&symbol=WAGE.json','Average Hourly Earnings YoY','legacy snapshot','WAGE','monthly'),
    'treasury-2y': ('macro/chart__days=252&symbol=UST2Y.json','US 2Y Treasury','legacy snapshot','UST2Y','daily'),
    'treasury-10y': ('macro/chart__days=20000&symbol=_5eTNX.json','US 10Y Treasury','legacy snapshot','^TNX','daily'),
    'real-10y': ('macro/chart__days=20000&symbol=REAL10Y.json','US 10Y Real Yield','legacy snapshot','DFII10','daily'),
    'usdkrw': ('macro/chart__days=365&symbol=KRW_3dX.json','USD/KRW','legacy snapshot','KRW=X','daily'),
    'dxy': ('macro/chart__days=20000&symbol=DX-Y.NYB.json','US Dollar Index','legacy snapshot','DX-Y.NYB','daily'),
    'ndx': ('macro/chart__days=365&symbol=_5eNDX.json','Nasdaq 100','legacy snapshot','^NDX','daily'),
    'spx': ('macro/chart__days=365&symbol=_5eGSPC.json','S&P 500','legacy snapshot','^GSPC','daily'),
    'kospi': ('macro/history__from=2003-01-01&symbol=_5eKS11.json','KOSPI','legacy snapshot','^KS11','daily'),
    'sox': ('macro/chart__days=365&symbol=_5eSOX.json','Philadelphia Semiconductor','legacy snapshot','^SOX','daily'),
    'gold': ('macro/chart__days=365&symbol=GC_3dF.json','Gold Futures','legacy snapshot','GC=F','daily'),
    'oil': ('macro/chart__days=365&symbol=CL_3dF.json','WTI Futures','legacy snapshot','CL=F','daily'),
    'orcl': ('macro/chart__days=365&symbol=ORCL.json','Oracle','legacy snapshot','ORCL','daily'),
    'vix': ('macro/chart__days=20000&symbol=_5eVIX.json','VIX','legacy snapshot','^VIX','daily'),
    'credit': ('macro/chart__days=252&symbol=CREDIT_5fRATIO.json','HYG/LQD Credit Ratio','legacy snapshot','HYG/LQD','daily'),
    'bei': ('macro/chart__days=20000&symbol=BEI.json','10Y Breakeven Inflation','legacy snapshot','T10YIE','daily'),
    'curve-10y2y': ('macro/chart__days=20000&symbol=T10Y2Y.json','10Y-2Y Spread','legacy snapshot','T10Y2Y','daily'),
    'hy-oas': ('macro/chart__days=20000&symbol=HYOAS.json','High Yield OAS','legacy snapshot','BAMLH0A0HYM2','daily'),
    'fed-target': ('macro/chart__days=252&symbol=FEDTARGET.json','Effective Federal Funds Rate','legacy snapshot','DFF','daily'),
}

def extract(payload):
    raw = payload if isinstance(payload,list) else payload.get('series') or payload.get('rows') or []
    out=[]
    for row in raw:
        date=str(row.get('date') or row.get('month') or '')
        value=row.get('value', row.get('close'))
        try:value=float(value)
        except Exception:continue
        if date:out.append({'date':date,'value':value})
    by={r['date']:r for r in out}
    return [by[k] for k in sorted(by)]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--data-dir',default='public/data');args=ap.parse_args();root=pathlib.Path(args.data_dir)
    now=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    total=0
    for series_id,(rel,name,source,symbol,freq) in MAPPING.items():
        src=root/rel
        if not src.exists():continue
        try:rows=extract(json.loads(src.read_text(encoding='utf-8')))
        except Exception:continue
        if not rows:continue
        dest=root/'history'/f'{series_id}.json';existing=[]
        if dest.exists():
            try:existing=extract(json.loads(dest.read_text(encoding='utf-8')))
            except Exception:existing=[]
        merged={r['date']:r for r in existing}
        merged.update({r['date']:r for r in rows})
        series=[merged[k] for k in sorted(merged)]
        payload={'schemaVersion':3,'id':series_id,'name':name,'source':source,'sourceSymbol':symbol,'frequency':freq,'updatedAt':now,'series':series}
        dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
        print(f'{series_id}: {len(series)}');total+=len(series)
    print('total',total)
if __name__=='__main__':main()
