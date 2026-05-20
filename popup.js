const DEFAULT_PROMPT =
  '以下の投稿に対して、プロのBTCスキャルパーとしての視点を交えた、具体的かつ熱量のある1〜2文の返信を1つだけ出力してください。絵文字を1〜2個自然に含めること。「参考になります」「勉強になります」などの定型句は厳禁。余計な挨拶や解説は一切省き、返信文のみを出力すること。\n\n【対象の投稿】\n';

const apiKeyEl = document.getElementById('apiKey');
const promptEl = document.getElementById('customPrompt');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

chrome.storage.local.get(['apiKey', 'customPrompt'], ({ apiKey, customPrompt }) => {
  if (apiKey) apiKeyEl.value = apiKey;
  promptEl.value = customPrompt !== undefined ? customPrompt : DEFAULT_PROMPT;
});

saveBtn.addEventListener('click', () => {
  const apiKey = apiKeyEl.value.trim();
  const customPrompt = promptEl.value;

  if (!apiKey) {
    statusEl.textContent = 'APIキーを入力してください';
    statusEl.className = 'error';
    return;
  }

  chrome.storage.local.set({ apiKey, customPrompt }, () => {
    statusEl.textContent = '保存しました';
    statusEl.className = 'success';
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = '';
    }, 2000);
  });
});
