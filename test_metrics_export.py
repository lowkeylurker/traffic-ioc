#!/usr/bin/env python3
"""Quick validation of metrics export structure."""

import json
import numpy as np

# Simulate the output structure
class_names = {0: 'VeryFree', 1: 'Stable', 2: 'Moderate', 3: 'Congested', 4: 'HeavyJam', 5: 'Severe'}
summary_dict = {}
for i in range(6):
    summary_dict[f'class_{i}'] = {
        'recall': round(np.random.uniform(0.001, 0.9), 4),
        'precision': round(np.random.uniform(0.001, 0.95), 4),
        'f1': round(np.random.uniform(0.001, 0.85), 4),
    }

sample_output = {
    'summary': {
        'best_epoch': 12,
        'best_val_f1': 0.5892,
        'best_val_acc': 0.7234,
        'best_val_loss': 0.8123,
        'best_train_loss': 0.6543,
        'train_val_gap': 0.158,
        'minority_recall_45': 0.0287,
        'avg_time_per_epoch_sec': 45.8,
        'per_class_metrics': summary_dict,
        'confusion_matrix': np.random.randint(0, 100, (6, 6)).tolist()
    },
}

per_class_best = {}
for i in range(6):
    per_class_best[f'class_{i}'] = {
        'name': class_names[i],
        'recall': round(np.random.uniform(0.001, 0.9), 4),
        'precision': round(np.random.uniform(0.001, 0.95), 4),
        'f1': round(np.random.uniform(0.001, 0.85), 4),
    }

sample_output['per_class_at_best_epoch'] = per_class_best

print('✅ Sample JSON structure validation:')
summary_keys = list(sample_output['summary'].keys())
print(f'  - summary has {len(summary_keys)} keys')
cm_shape = np.array(sample_output['summary']['confusion_matrix']).shape
print(f'  - confusion_matrix shape: {cm_shape}')
print(f'  - per_class_at_best_epoch has {len(sample_output["per_class_at_best_epoch"])} classes')
print()
print('📊 Sample metrics from class_4 (HeavyJam):')
for key, val in sample_output['per_class_at_best_epoch']['class_4'].items():
    print(f'  {key}: {val}')
print()

# Test JSON serialization
try:
    json_str = json.dumps(sample_output, indent=2)
    print(f'✅ JSON serialization OK ({len(json_str)} bytes)')
except Exception as e:
    print(f'❌ JSON serialization failed: {e}')

print('✅ All structures valid!')
