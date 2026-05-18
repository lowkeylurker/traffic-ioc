import json

notebook_path = "/workspace/ai-core/notebooks/05_Double_DQN_Training_Loop.ipynb"

with open(notebook_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

for cell in nb.get('cells', []):
    if cell.get('cell_type') == 'code':
        source = "".join(cell.get('source', []))
        if "RLTrainingConfig(" in source:
            lines = source.split('\n')
            new_lines = []
            for line in lines:
                if "batch_size=256" in line:
                    new_lines.append("    batch_size=512,              # Tăng lên 512 để Gradient mượt hơn với Reward mới")
                elif "use_class_aware_reward=False," in line:
                    # Add reward_clip right after this line
                    new_lines.append(line)
                    new_lines.append("    reward_clip=350.0,           # Nới lỏng trần phạt để hình phạt -250 phát huy tối đa")
                else:
                    new_lines.append(line)
                    
            cell['source'] = [line + '\n' for line in new_lines[:-1]] + [new_lines[-1]] if new_lines else []
            break

with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)

print("Updated config (batch_size, reward_clip) in notebook 05 successfully.")
