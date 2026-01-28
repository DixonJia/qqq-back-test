#!/usr/bin/env python
"""
下载 QQQ 的历史日线数据并生成年度回报 CSV（Year,ReturnPercent）。

用法示例：
  python fetch_qqq_annual.py --start 1999-03-10 --end 2026-01-28 --out qqq_annual_returns.csv

依赖：yfinance, pandas
  pip install yfinance pandas
"""

import argparse
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', default='1999-03-10')
    parser.add_argument('--end', default=None)
    parser.add_argument('--out', default='qqq_annual_returns.csv')
    args = parser.parse_args()

    try:
        import yfinance as yf
        import pandas as pd
    except Exception as e:
        print('请先安装依赖: pip install yfinance pandas')
        raise

    symbol = 'QQQ'

    print('尝试使用 yfinance 下载', symbol)
    try:
        df = yf.download(symbol, start=args.start, end=args.end, progress=False, auto_adjust=True)
        if df.empty:
            raise RuntimeError('yfinance 返回空数据')
        df.index = pd.to_datetime(df.index)
        df = df.sort_index()
        df['year'] = df.index.year
        annual = df.groupby('year')['Close'].agg(['first','last']).reset_index()
        annual['return_pct'] = (annual['last'] / annual['first'] - 1) * 100
        annual[['year','return_pct']].to_csv(args.out, index=False, header=False)
        print('已写入:', args.out)
        return
    except Exception as e:
        print('yfinance 下载失败：', e)

    # fallback: 使用 stooq
    try:
        print('尝试使用 stooq (https://stooq.com) 作为后备')
        url = 'https://stooq.com/q/d/l/?s=qqq.us&i=d'
        df = pd.read_csv(url, parse_dates=['Date'], index_col='Date')
        df = df.sort_index()
        df['year'] = df.index.year
        annual = df.groupby('year')['Close'].agg(['first','last']).reset_index()
        annual['return_pct'] = (annual['last'] / annual['first'] - 1) * 100
        annual[['year','return_pct']].to_csv(args.out, index=False, header=False)
        print('已写入（来自 stooq）:', args.out)
        return
    except Exception as e:
        print('stooq 下载也失败：', e)

    print('无法自动下载数据，请手动准备 CSV 年度收益并上传到网页。')

if __name__ == '__main__':
    main()
