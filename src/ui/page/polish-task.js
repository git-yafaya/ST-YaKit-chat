/**
 * 润色设置抽屉「本次任务」：本次补充要求 + 参考材料（只管界面，校验、保存、何时生效都交给业务层）
 *
 * 按聊天保存，和长期的文风预设分开，不写回文风正文。
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat.polishUI 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * taskInputs 的形状：
 *   {
 *     instructions: string,                              本次补充要求，'' 表示不加；最多 4000 字
 *     references: [{ kind: 'style' | 'context', text }], 参考材料，按列表顺序；style = 文风参考，context = 上下文说明
 *                                                        最多 6 条，每条最多 6000 字，合计最多 18000 字；空正文的条目保存时移除
 *   }
 *
 * 17. polishUI.getTaskInputs() → Promise<taskInputs>      当前聊天已保存的输入，没有时为 { instructions: '', references: [] }
 * 18. polishUI.saveTaskInputs(patch) → Promise<taskInputs> patch 只传改动的字段；references 整份替换
 *       失败时 reject Error，message 是给用户看的中文原因；error.field 为
 *       'instructions' / 'references' / 'references.N.kind' / 'references.N.text'（N 从 0 起），界面显示在对应输入旁，保留用户输入
 *
 * 生效：每次开始、继续、重做、润色新增部分时读取已保存的值，这一轮里的续写和重试沿用；润色进行中不能修改。
 * 清空结果时一起清空；不进预设备份。
 * 两个接口没提供时，这一节照样显示，写「本次任务还没接入」，不能编辑。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.polishUI;
  const ready = () => ['getTaskInputs', 'saveTaskInputs'].every((name) => typeof service()?.[name] === 'function');

  const MAX_REFERENCES = 6;
  const KINDS = { style: '文风参考', context: '上下文说明' };
  const PLACEHOLDERS = {
    style: '贴一段想学的文字，只学写法，不照抄内容',
    context: '写人物关系、专名或前情，只帮助理解',
  };

  let inputs = { instructions: '', references: [] };
  let running = false;
  let loading = false;

  const editable = () => ready() && !running && !loading;

  function normalize(value) {
    const references = Array.isArray(value?.references) ? value.references : [];
    return {
      instructions: typeof value?.instructions === 'string' ? value.instructions : '',
      references: references.map((item) => ({
        kind: item?.kind === 'context' ? 'context' : 'style',
        text: typeof item?.text === 'string' ? item.text : '',
      })),
    };
  }

  /* ---------- 显示 ---------- */

  function renderState() {
    const available = ready();
    const can = editable();
    $('polish-task-off').hidden = available;
    $('polish-request').toggleAttribute('disabled', !can);
    $('polish-ref-add').toggleAttribute('disabled', !can || inputs.references.length >= MAX_REFERENCES);
    $('polish-ref-list').querySelectorAll('.polish-ref').forEach((row) => {
      row.querySelector('yakit-segmented').toggleAttribute('inert', !can);
      row.querySelectorAll('yakit-input, yakit-button').forEach((control) => control.toggleAttribute('disabled', !can));
    });
  }

  function renderReferences() {
    $('polish-ref-list').replaceChildren(...inputs.references.map((item, index) => {
      const row = document.createElement('div');
      row.className = 'polish-ref';
      row.innerHTML = `
        <div class="polish-ref-head">
          <yakit-segmented size="sm">
            <option value="style">${KINDS.style}</option>
            <option value="context">${KINDS.context}</option>
          </yakit-segmented>
          <yakit-button variant="ghost" size="sm" icon="../icons/trash.svg"></yakit-button>
        </div>
        <yakit-input multiline rows="4"></yakit-input>
      `;
      const kind = row.querySelector('yakit-segmented');
      const input = row.querySelector('yakit-input');
      const remove = row.querySelector('yakit-button');
      kind.setAttribute('aria-label', `第 ${index + 1} 条参考的用途`);
      kind.setAttribute('value', item.kind);
      input.setAttribute('aria-label', `第 ${index + 1} 条参考材料`);
      input.setAttribute('placeholder', PLACEHOLDERS[item.kind]);
      input.value = item.text;
      remove.setAttribute('aria-label', `删除第 ${index + 1} 条参考`);

      kind.addEventListener('change', (event) => {
        item.kind = event.detail.value;
        input.setAttribute('placeholder', PLACEHOLDERS[item.kind]);
        save('references');
      });
      input.addEventListener('input', () => {
        item.text = input.value;
        scheduleSave('references');
      });
      remove.addEventListener('click', () => {
        inputs.references.splice(index, 1);
        renderReferences();
        save('references');
      });
      return row;
    }));
    renderState();
  }

  function clearErrors(key) {
    if (key === 'instructions') {
      $('polish-request').removeAttribute('error');
      return;
    }
    $('polish-ref-list').querySelectorAll('yakit-input').forEach((input) => input.removeAttribute('error'));
  }

  function showError(error, fallback) {
    const message = error?.message || fallback;
    const field = String(error?.field || '');
    const match = field.match(/^references\.(\d+)\.(kind|text)$/);
    const row = match ? $('polish-ref-list').children[Number(match[1])] : null;
    if (field === 'instructions') $('polish-request').setAttribute('error', message);
    else if (row) row.querySelector('yakit-input').setAttribute('error', message);
    else if (field === 'references' && $('polish-ref-list').lastElementChild) {
      $('polish-ref-list').lastElementChild.querySelector('yakit-input').setAttribute('error', message);
    } else YaKitToast.show(message, 'danger');
  }

  /* ---------- 读取、保存 ---------- */

  async function load() {
    clearTimeout(saveTimer);
    pending.clear();
    if (ready()) {
      loading = true;
      renderState();
      try {
        inputs = normalize(await service().getTaskInputs());
      } catch (error) {
        YaKitErrorLog.warn('读取本次任务失败', error);
        inputs = { instructions: '', references: [] };
      } finally {
        loading = false;
      }
    } else {
      inputs = { instructions: '', references: [] };
    }
    $('polish-request').value = inputs.instructions;
    clearErrors('instructions');
    renderReferences();
  }

  // 输入时稍等再保存；保存失败时保留输入框里的内容，只显示原因
  let saveTimer = null;
  const pending = new Set();
  const scheduleSave = (key) => {
    pending.add(key);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  };
  const save = (key) => {
    pending.add(key);
    flush();
  };

  async function flush() {
    clearTimeout(saveTimer);
    if (!editable() || !pending.size) return;
    const patch = {};
    if (pending.has('instructions')) patch.instructions = inputs.instructions;
    if (pending.has('references')) patch.references = structuredClone(inputs.references);
    pending.forEach(clearErrors);
    pending.clear();
    try {
      await service().saveTaskInputs(patch);
    } catch (error) {
      showError(error, '保存本次任务失败');
    }
  }

  /* ---------- 操作 ---------- */

  $('polish-request').addEventListener('input', (event) => {
    inputs.instructions = event.currentTarget.value;
    scheduleSave('instructions');
  });

  $('polish-ref-add').addEventListener('click', () => {
    if (!editable() || inputs.references.length >= MAX_REFERENCES) return;
    inputs.references.push({ kind: 'style', text: '' });
    renderReferences();
    $('polish-ref-list').lastElementChild?.querySelector('yakit-input')?.focus();
  });

  $('polish-settings').addEventListener('click', load);
  $('polish-drawer-done').addEventListener('click', flush);

  // 任务状态变化：进行中不能编辑；结果被清空或切换聊天后重新读取
  window.addEventListener('yakit-polish-job', (event) => {
    running = Boolean(event.detail?.running);
    if (event.detail?.reload && $('polish-drawer').open) load();
    else renderState();
  });

  renderState();
})();
