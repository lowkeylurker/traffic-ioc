import json
import os

notebook_path = "/workspace/ai-core/notebooks/06_Model_Evaluation_Error_Analysis_XAI.ipynb"

with open(notebook_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Define new cells to insert
new_cells = [
    {
        "cell_type": "markdown",
        "id": "comparison_section_md",
        "metadata": {
            "id": "comparison_section_md",
            "language": "markdown"
        },
        "source": [
            "## 0. Model Comparison: RL vs SL (LSTM)\n",
            "\n",
            "So sánh trực tiếp giữa mô hình Học tăng cường (RL) và mô hình Học giám sát (LSTM cổ điển) dựa trên các tiêu chí vận hành thực tế."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "id": "load_sl_data",
        "metadata": {
            "id": "load_sl_data",
            "language": "python"
        },
        "outputs": [],
        "source": [
            "# ==== SL & Vanilla Prediction Config ====\n",
            "SL_PREDICTIONS_PATH = PROJECT_ROOT / \"artifacts\" / \"ml\" / \"evaluation\" / f\"predictions_sl_manual_h15.parquet\"\n",
            "VANILLA_PREDICTIONS_PATH = PROJECT_ROOT / \"artifacts\" / \"ml\" / \"evaluation\" / \"predictions_vanilla.parquet\"\n",
            "\n",
            "sl_eval_df = None\n",
            "if SL_PREDICTIONS_PATH.exists():\n",
            "    sl_eval_df = pd.read_parquet(SL_PREDICTIONS_PATH)\n",
            "    y_true_sl = sl_eval_df['y_true'].to_numpy()\n",
            "    y_pred_sl = sl_eval_df['y_pred'].to_numpy()\n",
            "    print(f\"✅ Nạp dữ liệu SL thành công từ: {SL_PREDICTIONS_PATH}\")\n",
            "\n",
            "vanilla_eval_df = None\n",
            "if VANILLA_PREDICTIONS_PATH.exists():\n",
            "    vanilla_eval_df = pd.read_parquet(VANILLA_PREDICTIONS_PATH)\n",
            "    y_true_vanilla = vanilla_eval_df['y_true'].to_numpy()\n",
            "    y_pred_vanilla = vanilla_eval_df['y_pred'].to_numpy()\n",
            "    print(f\"✅ Nạp dữ liệu Vanilla thành công từ: {VANILLA_PREDICTIONS_PATH}\")"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "id": "compute_comparison",
        "metadata": {
            "id": "compute_comparison",
            "language": "python"
        },
        "outputs": [],
        "source": [
            "from sklearn.metrics import accuracy_score, f1_score\n",
            "\n",
            "def compute_detailed_comparison(y_true, y_pred, name=\"Model\"):\n",
            "    # 1. Adjacency Accuracy (error <= 1 class)\n",
            "    diff = np.abs(y_true - y_pred)\n",
            "    adj_acc = np.mean(diff <= 1)\n",
            "    \n",
            "    # 2. Binary State Analysis (Congested vs Free-flow)\n",
            "    y_true_bin = (y_true >= 3).astype(int)\n",
            "    y_pred_bin = (y_pred >= 3).astype(int)\n",
            "    \n",
            "    # False Alarm: Thực tế Thoáng -> Dự báo Kẹt\n",
            "    false_alarms = np.sum((y_true_bin == 0) & (y_pred_bin == 1))\n",
            "    fa_rate = false_alarms / np.sum(y_true_bin == 0) if np.sum(y_true_bin == 0) > 0 else 0\n",
            "    \n",
            "    # Missed Detection: Thực tế Kẹt -> Dự báo Thoáng\n",
            "    misses = np.sum((y_true_bin == 1) & (y_pred_bin == 0))\n",
            "    miss_rate = misses / np.sum(y_true_bin == 1) if np.sum(y_true_bin == 1) > 0 else 0\n",
            "    \n",
            "    acc = accuracy_score(y_true, y_pred)\n",
            "    f1 = f1_score(y_true, y_pred, average='macro')\n",
            "    \n",
            "    return {\n",
            "        \"Model Name\": name,\n",
            "        \"Accuracy\": acc,\n",
            "        \"Macro F1\": f1,\n",
            "        \"Adj. Acc (±1 class)\": adj_acc,\n",
            "        \"Thoáng -> Kẹt (False Alarm)\": fa_rate,\n",
            "        \"Kẹt -> Thoáng (Miss)\": miss_rate\n",
            "    }\n",
            "\n",
            "results = []\n",
            "results.append(compute_detailed_comparison(y_true, y_pred, name=\"RL Model (DQN)\"))\n",
            "\n",
            "if sl_eval_df is not None:\n",
            "    results.append(compute_detailed_comparison(y_true_sl, y_pred_sl, name=\"SL Model (Hybrid)\"))\n",
            "\n",
            "if vanilla_eval_df is not None:\n",
            "    results.append(compute_detailed_comparison(y_true_vanilla, y_pred_vanilla, name=\"Vanilla LSTM (Pure Dynamic)\"))\n",
            "\n",
            "comparison_summary = pd.DataFrame(results)\n",
            "display(comparison_summary.style.highlight_max(subset=[\"Accuracy\", \"Macro F1\", \"Adj. Acc (±1 class)\"], color='lightgreen')\\\n",
            "                          .highlight_min(subset=[\"Thoáng -> Kẹt (False Alarm)\", \"Kẹt -> Thoáng (Miss)\"], color='lightgreen'))"
        ]
    }
]

# Find insertion index (after data loading cell)
insert_idx = 3 # Default after 3 cells (Intro, Imports, Load RL Data)
for i, cell in enumerate(nb['cells']):
    if 'eval_df = pd.read_parquet' in "".join(cell.get('source', [])):
        insert_idx = i + 1
        break

# Insert the new cells
nb['cells'] = nb['cells'][:insert_idx] + new_cells + nb['cells'][insert_idx:]

with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print(f"Notebook updated successfully at {notebook_path}")
