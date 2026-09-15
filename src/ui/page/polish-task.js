/**
 * 润色设置抽屉「本次任务」：补充要求 + 参考材料（只管界面，保存、何时生效都交给业务层）
 *
 * 和长期的文风预设分开：只约束这次润色，不写回文风正文。
 *
 * ───────── 界面需要的业务接口（由 Codex 在 YaKitChat.polishUI 上提供，界面通过 parent.YaKitChat 调用）─────────
 *
 * task 的形状：
 *   {
 *     request: string,                         补充要求，空字符串表示不加
 *     references: [{ use: 'style' | 'context', text: string }],
 *                                              参考材料，按添加顺序；style = 文风参考（只学写法），context = 上下文说明（只帮助理解）
 *   }
 *
 * 17. polishUI.getTask() → task（可以返回 Promise）
 * 18. polishUI.saveTask(task)                  每次改动后整份传入；失败时 reject Error，message 是给用户看的中文原因，
 *       error.field = 'request' 时提示显示在补充要求下方，error.field = 'references' 且带 error.index 时显示在那一条下方，
 *       其他情况用提示消息显示
 *
 * 由业务层定并写明：开始新任务、继续、截断续写、选楼重做、润色新增部分分别用哪份值；刷新后怎么恢复；
 * 清空结果时是否一起清空；是否进入备份；条数和字数上限。
 * 润色进行中界面不让编辑；两个接口没提供时，这一节照样显示，写「本次任务还没接入」，不能编辑。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const service = () => parent.YaKitChat?.polishUI;
  const ready = () => ['getTask', 'saveTask'].every((name) => typeof service()?.[name] === 'function');

  const USES = { style: '文风参考', context: '上下文说明' };
  const PLACEHOLDERS = {
    style: '贴一段想学的文字，只学写法，不照抄内容',
    context: '写人物关系、专名或前情，只帮助理解',
  };

  let task = { request: '', references: [] };
  let running = false;

  const editable = () => ready() && !running;

  function normalize(value) {
    const references = Array.isArray(value?.references) ? value.references : [];
    return {
      request: typeof value?.request === 'string' ? value.request : '',
      references: references.map((item) => ({
        use: item?.use === 'context' ? 'context' : 'style',
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
    $('polish-ref-add').toggleAttribute('disabled', !can);
    $('polish-ref-list').querySelectorAll('.polish-ref').forEach((row) => {
      row.querySelector('yakit-segmented').toggleAttribute('inert', !can);
      row.querySelectorAll('yakit-input, yakit-button').forEach((control) => control.toggleAttribute('disabled', !can));
    });
  }

  function renderReferences() {
    $('polish-ref-list').replaceChildren(...task.references.map((item, index) => {
      const row = document.createElement('div');
      row.className = 'polish-ref';
      row.innerHTML = `
        <div class="polish-ref-head">
          <yakit-segmented size="sm">
            <option value="style">${USES.style}</option>
            <option value="context">${USES.context}</option>
          </yakit-segmented>
          <yakit-button variant="ghost" size="sm" icon="../icons/trash.svg"></yakit-button>
        </div>
        <yakit-input multiline rows="4"></yakit-input>
      `;
      const use = row.querySelector('yakit-segmented');
      const input = row.querySelector('yakit-input');
      const remove = row.querySelector('yakit-button');
      use.setAttribute('aria-label', `第 ${index + 1} 条参考的用途`);
      use.setAttribute('value', item.use);
      input.setAttribute('aria-label', `第 ${index + 1} 条参考材料`);
      input.setAttribute('placeholder', PLACEHOLDERS[item.use]);
      input.value = item.text;
      remove.setAttribute('aria-label', `删除第 ${index + 1} 条参考`);

      use.addEventListener('change', (event) => {
        item.use = event.detail.value;
        input.setAttribute('placeholder', PLACEHOLDERS[item.use]);
        save();
      });
      input.addEventListener('input', () => {
        item.text = input.value;
        scheduleSave();
      });
      remove.addEventListener('click', () => {
        task.references.splice(index, 1);
        renderReferences();
        save();
      });
      return row;
    }));
    renderState();
  }

  function clearErrors() {
    $('polish-request').removeAttribute('error');
    $('polish-ref-list').querySelectorAll('yakit-input').forEach((input) => input.removeAttribute('error'));
  }

  /* ---------- 读取、保存 ---------- */

  async function load() {
    if (!ready()) {
      task = { request: '', references: [] };
    } else {
      try {
        task = normalize(await service().getTask());
      } catch (error) {
        YaKitErrorLog.warn('读取本次任务失败', error);
        task = { request: '', references: [] };
      }
    }
    $('polish-request').value = task.request;
    clearErrors();
    renderReferences();
  }

  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  };

  async function save() {
    clearTimeout(saveTimer);
    if (!editable()) return;
    clearErrors();
    try {
      await service().saveTask(structuredClone(task));
    } catch (error) {
      const message = error?.message || '保存本次任务失败';
      const row = Number.isInteger(error?.index) ? $('polish-ref-list').children[error.index] : null;
      if (error?.field === 'request') $('polish-request').setAttribute('error', message);
      else if (error?.field === 'references' && row) row.querySelector('yakit-input').setAttribute('error', message);
      else YaKitToast.show(message, 'danger');
    }
  }

  /* ---------- 操作 ---------- */

  $('polish-request').addEventListener('input', (event) => {
    task.request = event.currentTarget.value;
    scheduleSave();
  });

  $('polish-ref-add').addEventListener('click', () => {
    if (!editable()) return;
    task.references.push({ use: 'style', text: '' });
    renderReferences();
    $('polish-ref-list').lastElementChild?.querySelector('yakit-input')?.focus();
  });

  $('polish-settings').addEventListener('click', load);

  window.addEventListener('yakit-polish-job', (event) => {
    running = Boolean(event.detail?.running);
    renderState();
  });

  renderState();
})();
