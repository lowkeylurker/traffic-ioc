import os
import sys
import tempfile
from pathlib import Path
import pandas as pd

# Ensure ai-core/tools is in path
sys.path.insert(0, str(Path(__file__).parent.parent / 'tools'))
from feature_quality import eda, importance


def make_sample(n=2000):
    import numpy as np
    rng = np.random.RandomState(42)
    df = pd.DataFrame({
        'speed': rng.normal(30, 5, size=n),
        'flow': rng.poisson(20, size=n),
        'humidity': rng.uniform(0, 100, size=n),
    })
    # synthetic target 0..2
    df['congestion_level'] = (df['speed'] < 28).astype(int) + (df['flow'] > 22).astype(int)
    return df


def test_eda_creates_report(tmp_path):
    df = make_sample(500)
    out = str(tmp_path / 'out')
    os.makedirs(out, exist_ok=True)
    res = eda.run_eda(df=df, out_dir=out, target='congestion_level')
    assert os.path.isdir(res)
    assert os.path.exists(os.path.join(res, 'report.csv'))
    assert os.path.exists(os.path.join(res, 'feature_summaries.csv'))


def test_importance_runs(tmp_path):
    df = make_sample(1000)
    out = str(tmp_path / 'imp')
    os.makedirs(out, exist_ok=True)
    path = importance.run_importance(df=df, out_dir=out, sample_size=None)
    assert os.path.exists(path)
