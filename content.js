const DEFAULT_PROMPT =
  '以下の投稿に対して、\nThreadsらしい自然な返信を1件だけ作成してください。\n\n【最重要】\n- "会話している感じ" を出す\n- AIっぽい綺麗な文章は禁止\n- 丁寧すぎる口調禁止\n- 解説しすぎない\n- マウント禁止\n- 人間っぽい温度感を優先\n- 少し雑なくらいで良い\n- 「参考になります」「勉強になります」禁止\n- "相手を立てつつ自然に混ざる" 感じ\n- Threads特有のゆるさを出す\n- 無理にオチを作らない\n- 会話が続きそうな空気感を作る\n- 20〜100文字程度\n- 1〜3文\n- 改行は自然ならOK\n- 絵文字は自然な場合のみ0〜1個\n- 絵文字無しも許可\n- 毎回違うテンション・文体にする\n\n【Threadsっぽい返信スタイル】\n以下からランダムで1つ選ぶ：\n- 共感\n- 独り言\n- 軽い雑談\n- 少し弱音\n- 温度感だけ\n- 日常感\n- ゆるい違和感\n- なんとなく分かる感じ\n- 軽い自虐\n- 会話を続ける感じ\n\n【禁止】\n- インプレ狙い感\n- 情報商材っぽさ\n- 強すぎる断定\n- 上から目線\n- 「〜すべき」\n- 「重要」\n- 「かなり危険」\n- 「チャンス」\n- 長文分析\n- 専門家ぶる口調\n\n【悪い例】\n「非常に参考になります」「その通りだと思います」「リスク管理が重要ですね」「かなり危険な相場です」「今後の展開に注目です」\n\n【良い雰囲気の例】\n「それ、なんか分かる。」\n「最近ほんと無理に触らない方が平和。」\n「その静かな感じ、逆に怖いんですよね。」\n「ちょっと前の相場思い出した。」\n「分かる。最近ずっとそんな感じ。」\n「気付いたら板ずっと見てる😅」\n「最近、ポジ持ってない時の方が落ち着く。」\n\n返信文のみを出力すること。余計な解説・前置き一切不要。\n\n【対象投稿】\n';

const EDITOR_SELECTOR = 'div[contenteditable="true"][data-lexical-editor="true"]';
const AI_BTN_CLASS = 'threads-smart-reply-ai-btn';
let isGenerating = false;

function isVisible(el) {
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
}

function getPostText(editor) {
  const candidates = [];

  const containers = [
    editor.closest('[role="dialog"]'),
    editor.closest('article'),
    editor.closest('main'),
  ].filter(Boolean);

  for (const container of containers) {
    const spans = container.querySelectorAll('span[dir="auto"], div[dir="auto"]');
    for (const span of spans) {
      if (span.contains(editor)) continue;
      const text = span.innerText?.trim();
      if (text && text.length > 10 && !span.querySelector(EDITOR_SELECTOR)) {
        candidates.push({ text, len: text.length });
      }
    }
    if (candidates.length > 0) break;
  }

  if (candidates.length === 0) {
    const allSpans = document.querySelectorAll('span[dir="auto"], div[dir="auto"]');
    for (const span of allSpans) {
      if (!isVisible(span)) continue;
      if (span.contains(editor) || editor.contains(span)) continue;
      const text = span.innerText?.trim();
      if (text && text.length > 10) {
        candidates.push({ text, len: text.length });
      }
    }
  }

  candidates.sort((a, b) => b.len - a.len);
  return candidates[0]?.text ?? null;
}

function findToolbarContainer(editor) {
  let el = editor.parentElement;
  while (el && el !== document.body) {
    const sibling = el.nextElementSibling;
    if (sibling) {
      const buttons = sibling.querySelectorAll('[role="button"]');
      if (buttons.length >= 2) return sibling;
    }
    const parent = el.parentElement;
    if (parent) {
      const children = [...parent.children];
      const editorIdx = children.indexOf(el);
      for (let i = editorIdx + 1; i < children.length; i++) {
        const candidate = children[i];
        const buttons = candidate.querySelectorAll('[role="button"]');
        if (buttons.length >= 2) return candidate;
      }
    }
    el = el.parentElement;
  }
  return null;
}

async function insertTextIntoLexicalEditor(text, editor) {
  editor.focus();

  await new Promise(r => setTimeout(r, 50));

  document.execCommand('selectAll', false, null);

  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  editor.dispatchEvent(
    new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    })
  );

  if (!editor.innerText.trim() || editor.innerText.trim() === text) return;

  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  document.execCommand('insertText', false, text);
}

function isExtensionAlive() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

function createAiButton() {
  const btn = document.createElement('div');
  btn.className = AI_BTN_CLASS;
  btn.title = 'AIで返信を生成';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.style.cssText =
    'display:inline-flex;align-items:center;justify-content:center;' +
    'width:34px;height:34px;cursor:pointer;border-radius:50%;' +
    'font-size:18px;line-height:1;transition:background 0.2s;flex-shrink:0;';
  btn.textContent = '✨';
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(0,149,246,0.1)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
  });
  return btn;
}

async function handleAiButtonClick(editor, btn) {
  if (isGenerating) return;
  if (!isExtensionAlive()) { editorObserver.disconnect(); return; }

  isGenerating = true;
  btn.style.opacity = '0.5';
  btn.style.pointerEvents = 'none';

  try {
    const postText = getPostText(editor);
    if (!postText) return;

    const { apiKey, customPrompt } = await chrome.storage.local.get(['apiKey', 'customPrompt']);
    if (!apiKey) return;

    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_REPLY',
      postText,
      prompt: customPrompt || DEFAULT_PROMPT,
      apiKey,
    });

    if (response?.success) await insertTextIntoLexicalEditor(response.reply, editor);
  } catch {
    if (!isExtensionAlive()) editorObserver.disconnect();
  } finally {
    isGenerating = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  }
}

function injectAiButton(editor) {
  const toolbar = findToolbarContainer(editor);
  if (!toolbar) return;
  if (toolbar.querySelector(`.${AI_BTN_CLASS}`)) return;

  const btn = createAiButton();
  if (isGenerating) {
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    handleAiButtonClick(editor, btn).catch(() => {});
  });
  btn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAiButtonClick(editor, btn).catch(() => {});
    }
  });
  toolbar.appendChild(btn);
}

const editorObserver = new MutationObserver(mutations => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const editors = node.matches(EDITOR_SELECTOR)
        ? [node]
        : node.querySelectorAll(EDITOR_SELECTOR);
      for (const editor of editors) {
        if (isVisible(editor)) injectAiButton(editor);
      }
    }
  }
});

editorObserver.observe(document.body, { childList: true, subtree: true });

document.querySelectorAll(EDITOR_SELECTOR).forEach(editor => {
  if (isVisible(editor)) injectAiButton(editor);
});
