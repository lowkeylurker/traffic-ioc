"""Small CLI to run the feature quality tiers (1,2,3)."""
from __future__ import annotations
import argparse
import sys
from pathlib import Path
import pandas as pd

from . import eda, importance, shap_analysis


def main(argv=None):
    p = argparse.ArgumentParser(prog='feature_quality')
    sp = p.add_subparsers(dest='cmd')

    run = sp.add_parser('run')
    run.add_argument('--tier', required=True, type=int, choices=[1,2,3])
    run.add_argument('--source', help='CSV source path')
    run.add_argument('--out', default='ai-core/reports/feature_qc')
    run.add_argument('--sample', type=int, default=None, help='Sample size for Tier 2 (default: no limit)')
    run.add_argument('--model-path', help='Path to model (for tier 3)')

    args = p.parse_args(argv)
    if args.cmd == 'run':
        out = Path(args.out)
        if args.tier == 1:
            sub = out / 'eda'
            eda.run_eda(source=args.source, out_dir=str(sub))
            print('EDA done ->', str(sub))
        elif args.tier == 2:
            sub = out / 'importance'
            importance.run_importance(source=args.source, out_dir=str(sub), sample_size=args.sample)
            print('Importance done ->', str(sub))
        elif args.tier == 3:
            # load model if path provided; else shap module will note missing
            if not args.model_path:
                print('Tier 3 requires --model-path or a model object; running shap placeholder')
                shap_analysis.run_shap(None, pd.DataFrame())
            else:
                print('Tier 3 requires a python-callable model; please use API for full run')
    else:
        p.print_help()


if __name__ == '__main__':
    main()
