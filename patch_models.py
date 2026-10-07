with open(r'C:\Users\freem\Documents\dashBot\lib\services\llm\model_catalog.dart', 'r') as f:
    data = f.read()

new_models = """
    'gemini-3.5-flash': ModelInfo(
      id: 'gemini-3.5-flash',
      provider: 'gemini',
      label: 'Gemini 3.5 Flash',
      contextWindow: 1048576,
      inputCostPer1M: 0.10,
      outputCostPer1M: 0.40,
      supportsTools: true,
      supportsVision: true,
    ),
    'gemini-pro-latest': ModelInfo(
      id: 'gemini-pro-latest',
      provider: 'gemini',
      label: 'Gemini Pro Latest',
      contextWindow: 1048576,
      inputCostPer1M: 0.10,
      outputCostPer1M: 0.40,
      supportsTools: true,
      supportsVision: true,
    ),
    'gemini-1.5-pro-latest': ModelInfo(
      id: 'gemini-1.5-pro-latest',
      provider: 'gemini',
      label: 'Gemini 1.5 Pro Latest',
      contextWindow: 2097152,
      inputCostPer1M: 1.25,
      outputCostPer1M: 5.00,
      supportsTools: true,
      supportsVision: true,
    ),
"""

if "'gemini-3.5-flash'" not in data:
    data = data.replace("'gemini-1.5-pro': ModelInfo(", new_models + "\n    'gemini-1.5-pro': ModelInfo(")
    with open(r'C:\Users\freem\Documents\dashBot\lib\services\llm\model_catalog.dart', 'w') as f:
        f.write(data)
    print("Patched successfully!")
else:
    print("Already patched!")
