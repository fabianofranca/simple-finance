// Tela Ajustes: contas, frequência do check-in, horizonte dos próximos meses e conexão.
// Regras de ordem e arquivo em src/accounts.js; dinheiro sempre por src/money.js.
import { activeAccounts, archivedAccounts, archive, move, newAccount, reactivate } from '../accounts.js';
import { clearConfig, loadConfig, shortUrl } from '../config.js';
import { formatInput, formatMoney, parseMoney } from '../money.js';
import { confirmDialog, h, queueLine, selectOnFocus } from './ui.js';

const FREQUENCIES = [
  ['always', 'Toda vez'],
  ['daily', '1x por dia'],
  ['weekly', '1x por semana']
];
const TYPES = ['expense', 'income'];
const DEFAULT_FREQUENCY = 'daily';
const DEFAULT_HORIZON = 3;
const MIN_HORIZON = 1;
const MAX_HORIZON = 12;

const typeLabel = (type) => (type === 'income' ? 'Entrada' : 'Conta');

function currentHorizon(settings) {
  const n = Number(settings?.horizonMonths);
  return Number.isInteger(n) && n >= MIN_HORIZON && n <= MAX_HORIZON ? n : DEFAULT_HORIZON;
}

export function mount(el, ctx) {
  const { store } = ctx;
  let alive = true;
  let archivedOpen = false; // "Arquivadas" continua aberta quando a tela é redesenhada
  const content = h('div', { class: 'settings' });
  // O diálogo fica fora de `content`: redesenhar a tela não fecha nem apaga o que está sendo digitado.
  const dialog = h('dialog', { class: 'account-dialog' });
  el.replaceChildren(content, dialog);

  // ----- diálogo de conta (nova ou existente) -----
  let editing = null; // { id } da conta aberta, ou { id: null } para conta nova

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  function openAccountDialog(account) {
    editing = { id: account ? account.id : null };
    let type = account ? account.type : 'expense';

    const name = h('input', {
      id: 'account-name',
      type: 'text',
      autocomplete: 'off',
      enterkeyhint: 'next',
      maxlength: 60
    });
    name.value = account ? account.name : '';
    const amount = h('input', {
      id: 'account-amount',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      enterkeyhint: 'done',
      placeholder: 'Sem valor padrão'
    });
    amount.value = account && Number.isInteger(account.defaultAmount) ? formatInput(account.defaultAmount) : '';
    selectOnFocus(amount);
    const error = h('p', { class: 'account-error', role: 'alert', hidden: true });

    const typeButtons = TYPES.map((value) =>
      h(
        'button',
        {
          type: 'button',
          class: 'seg-btn',
          'aria-pressed': String(value === type),
          onclick: () => {
            type = value;
            TYPES.forEach((t, i) => typeButtons[i].setAttribute('aria-pressed', String(t === type)));
          }
        },
        typeLabel(value)
      )
    );

    function showError(text, field) {
      error.textContent = text;
      error.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
    function clearError() {
      error.hidden = true;
      name.removeAttribute('aria-invalid');
      amount.removeAttribute('aria-invalid');
    }
    name.addEventListener('input', clearError);
    amount.addEventListener('input', clearError);

    const form = h(
      'form',
      { class: 'account-form', novalidate: true },
      h('h2', { class: 'account-title' }, account ? 'Editar conta' : 'Nova conta'),
      h('label', { for: 'account-name' }, 'Nome'),
      name,
      h('span', { class: 'field-label', id: 'account-type-label' }, 'Tipo'),
      h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'account-type-label' }, ...typeButtons),
      h('label', { for: 'account-amount' }, 'Valor padrão (opcional)'),
      amount,
      error,
      h(
        'div',
        { class: 'account-actions' },
        h('button', { type: 'submit' }, 'Salvar'),
        h('button', { type: 'button', class: 'ghost', onclick: closeDialog }, 'Cancelar')
      ),
      account &&
        h(
          'button',
          {
            type: 'button',
            class: 'link danger',
            onclick: async () => {
              const ok = await confirmDialog(`Arquivar ${account.name}? O histórico continua guardado.`, 'Arquivar');
              if (!ok || !alive) return;
              const current = (store.getData()?.accounts || []).find((a) => a.id === account.id) || account;
              closeDialog();
              store.saveAccount(archive(current));
            }
          },
          'Arquivar'
        )
    );

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const trimmed = name.value.trim();
      if (!trimmed) {
        showError('Escreva o nome da conta.', name);
        return;
      }
      let defaultAmount = null;
      if (amount.value.trim() !== '') {
        defaultAmount = parseMoney(amount.value);
        if (defaultAmount === null) {
          showError('Não entendi esse valor. Use um formato como 150,00 ou deixe em branco.', amount);
          return;
        }
      }
      const accounts = store.getData()?.accounts || [];
      if (account) {
        const current = accounts.find((a) => a.id === account.id) || account;
        store.saveAccount({ ...current, name: trimmed, type, defaultAmount });
      } else {
        const created = newAccount({ name: trimmed, type, defaultAmount }, accounts);
        if (!created) {
          showError('Escreva o nome da conta.', name);
          return;
        }
        store.saveAccount(created);
      }
      closeDialog();
    });

    dialog.replaceChildren(form);
    if (!dialog.open) dialog.showModal();
    name.focus();
    name.select();
  }

  // Toque fora da caixa fecha; ao fechar, o foco volta para quem abriu.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => {
    const last = editing;
    editing = null;
    if (!alive || !last) return;
    const target =
      last.id == null
        ? content.querySelector('[data-new-account]')
        : content.querySelector(`[data-account="${CSS.escape(String(last.id))}"]`) ||
          content.querySelector('[data-new-account]');
    if (target) target.focus();
  });

  // ----- ações -----
  function moveAccount(id, dir) {
    const accounts = store.getData()?.accounts || [];
    for (const changed of move(accounts, id, dir)) store.saveAccount(changed);
    // A tela foi redesenhada: devolve o foco à seta (ou à outra, se chegou na ponta).
    const arrows = [dir, dir === 'up' ? 'down' : 'up'];
    for (const d of arrows) {
      const btn = content.querySelector(`[data-move="${CSS.escape(String(id))}:${d}"]`);
      if (btn && !btn.disabled) {
        btn.focus();
        break;
      }
    }
  }

  function setFrequency(value) {
    store.saveSettings({ checkinFrequency: value });
  }

  function setHorizon(value) {
    if (value < MIN_HORIZON || value > MAX_HORIZON) return;
    store.saveSettings({ horizonMonths: value });
  }

  async function switchSheet() {
    const pending = store.getQueueState().pending;
    const text =
      'Trocar a planilha? O endereço, a chave e os dados guardados neste aparelho serão apagados.' +
      (pending > 0 ? ' Alterações que ainda não foram enviadas serão perdidas.' : '');
    const ok = await confirmDialog(text, 'Trocar planilha');
    if (!ok || !alive) return;
    // Sai da tela antes de limpar, para ela não piscar "Carregando…".
    alive = false;
    unsubscribe();
    closeDialog();
    clearConfig();
    store.clear();
    try {
      localStorage.removeItem('sf.snooze');
    } catch {
      // sem acesso ao storage: nada a apagar
    }
    ctx.navigate('#mes', { replace: true }); // sem configuração, a casca mostra a tela de configuração
  }

  // ----- pedaços da tela -----
  function accountsSection(data) {
    const active = activeAccounts(data.accounts);
    const archived = archivedAccounts(data.accounts);

    // Entradas e Contas são listas separadas (como na tela Mês); as setas valem dentro de cada uma.
    const rowsOf = (list) => list.map((account, i) => {
      const meta = `${typeLabel(account.type)} · ${
        Number.isInteger(account.defaultAmount) ? formatMoney(account.defaultAmount) : 'sem valor padrão'
      }`;
      return h(
        'li',
        { class: 'st-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'account-btn',
            'data-account': account.id,
            'aria-label': `Editar ${account.name}. ${meta}`,
            onclick: () => openAccountDialog(account)
          },
          h('span', { class: 'account-name' }, account.name),
          h('span', { class: 'account-meta' }, meta)
        ),
        h('button', {
          type: 'button',
          class: 'arrow',
          'data-move': `${account.id}:up`,
          'aria-label': `Subir ${account.name}`,
          disabled: i === 0,
          onclick: () => moveAccount(account.id, 'up')
        }, '↑'),
        h('button', {
          type: 'button',
          class: 'arrow',
          'data-move': `${account.id}:down`,
          'aria-label': `Descer ${account.name}`,
          disabled: i === list.length - 1,
          onclick: () => moveAccount(account.id, 'down')
        }, '↓')
      );
    });

    const archivedBlock =
      archived.length > 0 &&
      h(
        'details',
        {
          class: 'archived',
          open: archivedOpen
        },
        h('summary', {}, `Arquivadas (${archived.length})`),
        h(
          'ul',
          { class: 'st-list' },
          ...archived.map((account) =>
            h(
              'li',
              { class: 'st-row' },
              h(
                'span',
                { class: 'account-static' },
                h('span', { class: 'account-name' }, account.name),
                h('span', { class: 'account-meta' }, typeLabel(account.type))
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'link',
                  'aria-label': `Reativar ${account.name}`,
                  onclick: () => store.saveAccount(reactivate(account))
                },
                'Reativar'
              )
            )
          )
        )
      );
    if (archivedBlock) {
      archivedBlock.addEventListener('toggle', () => {
        archivedOpen = archivedBlock.open;
      });
    }

    const listSection = (title, type, emptyText) => {
      const rows = rowsOf(active.filter((a) => a.type === type));
      return [
        h('h2', {}, title),
        rows.length ? h('ul', { class: 'st-list' }, ...rows) : h('p', { class: 'st-note' }, emptyText)
      ];
    };

    return [
      h('section', { class: 'st-section' }, ...listSection('Entradas', 'income', 'Nenhuma entrada ativa.')),
      h(
        'section',
        { class: 'st-section' },
        ...listSection('Contas', 'expense', 'Nenhuma conta ativa.'),
        h('div', { class: 'st-add' }, h('button', { type: 'button', class: 'ghost', 'data-new-account': '', onclick: () => openAccountDialog(null) }, 'Nova conta')),
        archivedBlock
      )
    ];
  }

  function checkinSection(settings) {
    const current = FREQUENCIES.some(([v]) => v === settings.checkinFrequency) ? settings.checkinFrequency : DEFAULT_FREQUENCY;
    return h(
      'section',
      { class: 'st-section' },
      h('h2', { id: 'st-checkin-title' }, 'Check-in'),
      h('p', { class: 'st-note' }, 'Com que frequência o app pergunta o saldo ao abrir.'),
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-labelledby': 'st-checkin-title' },
        ...FREQUENCIES.map(([value, label]) =>
          h('button', {
            type: 'button',
            class: 'seg-btn',
            'aria-pressed': String(value === current),
            onclick: () => setFrequency(value)
          }, label)
        )
      )
    );
  }

  function horizonSection(settings) {
    const n = currentHorizon(settings);
    return h(
      'section',
      { class: 'st-section' },
      h('h2', {}, 'Próximos meses'),
      h('p', { class: 'st-note' }, 'Quantos meses aparecem no Mês e na tela Posso comprar?'),
      h(
        'div',
        { class: 'stepper', role: 'group', 'aria-label': 'Quantidade de meses' },
        h('button', {
          type: 'button',
          class: 'step-btn',
          'aria-label': 'Menos um mês',
          disabled: n <= MIN_HORIZON,
          onclick: () => setHorizon(n - 1)
        }, '−'),
        h('span', { class: 'step-value', 'aria-live': 'polite' }, String(n)),
        h('button', {
          type: 'button',
          class: 'step-btn',
          'aria-label': 'Mais um mês',
          disabled: n >= MAX_HORIZON,
          onclick: () => setHorizon(n + 1)
        }, '+')
      )
    );
  }

  function connectionSection() {
    const url = shortUrl(loadConfig().url);
    return h(
      'section',
      { class: 'st-section' },
      h('h2', {}, 'Planilha'),
      h('p', { class: 'st-url' }, `Planilha: ${url || 'não identificada'}`),
      h('button', { type: 'button', class: 'ghost', onclick: switchSheet }, 'Trocar planilha')
    );
  }

  // ----- desenho -----
  // Redesenhar troca todos os botões; quem tinha o foco o recebe de volta (teclado e leitor de tela).
  const focusKey = (node) =>
    node.getAttribute('data-account') ||
    node.getAttribute('data-move') ||
    node.getAttribute('data-new-account') ||
    node.getAttribute('aria-label') ||
    node.textContent;

  function render() {
    if (!alive) return;
    const active = document.activeElement;
    const focused = active && content.contains(active) ? focusKey(active) : null;

    const data = store.getData();
    const title = h('h1', {}, 'Ajustes');
    if (!data) {
      content.replaceChildren(title, queueLine(store), h('p', { class: 'loading', role: 'status' }, 'Carregando…'));
      return;
    }
    const settings = data.settings || {};
    content.replaceChildren(
      title,
      queueLine(store),
      ...accountsSection(data),
      checkinSection(settings),
      horizonSection(settings),
      connectionSection()
    );

    if (focused !== null && !dialog.open) {
      const same = [...content.querySelectorAll('button, summary')].find((n) => focusKey(n) === focused && !n.disabled);
      if (same) same.focus();
    }
  }

  const unsubscribe = store.subscribe(render);
  render();

  return function unmount() {
    alive = false;
    unsubscribe();
    closeDialog();
    el.replaceChildren();
  };
}
