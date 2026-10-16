// Tela Ajustes: contas, frequência do check-in, horizonte dos próximos meses, últimas compras e conexão.
// Regras de ordem e arquivo em src/accounts.js; compras em src/purchases.js; dinheiro sempre por src/money.js.
import { activeAccounts, archivedAccounts, archivePlan, deletePlan, editAccount, move, newAccount, reactivate } from '../accounts.js';
import { clearConfig, loadConfig, shortUrl } from '../config.js';
import { formatInput, formatMoney, parseMoney } from '../money.js';
import { buildUndo, recentPurchases } from '../purchases.js';
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
const DEFAULT_LIST_SIZE = 5;
const MIN_LIST_SIZE = 1;
const MAX_LIST_SIZE = 20;

const typeLabel = (type) => (type === 'income' ? 'Entrada' : 'Conta');
const isCard = (account) => account.type === 'expense' && account.isCard === true;

// Inteiro de min a max; fora disso (ou ausente), o padrão.
function inRange(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

const currentHorizon = (settings) => inRange(settings?.horizonMonths, MIN_HORIZON, MAX_HORIZON, DEFAULT_HORIZON);
const currentListSize = (settings) => inRange(settings?.purchaseListSize, MIN_LIST_SIZE, MAX_LIST_SIZE, DEFAULT_LIST_SIZE);

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
    // "É cartão de crédito": só para Conta. Com Entrada fica escondida (e não vale no salvar),
    // mas guarda a marcação se ela voltar para Conta antes de salvar.
    const card = h('input', { id: 'account-card', type: 'checkbox' });
    card.checked = Boolean(account && isCard(account));
    const cardField = h(
      'label',
      { class: 'account-card', for: 'account-card', hidden: type !== 'expense' },
      card,
      'É cartão de crédito'
    );
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
            cardField.hidden = type !== 'expense';
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
      cardField,
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
            // Ao gravar, fecha o diálogo; o foco volta para "Nova conta" (a conta saiu da lista).
            onclick: () => runPlan(archivePlan, account.id, 'Arquivar', closeDialog)
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
      const fields = { name: trimmed, type, defaultAmount, isCard: type === 'expense' && card.checked };
      if (account) {
        const current = accounts.find((a) => a.id === account.id) || account;
        const edited = editAccount(current, fields);
        if (!edited) {
          showError('Escreva o nome da conta.', name);
          return;
        }
        store.saveAccount(edited);
      } else {
        const created = newAccount(fields, accounts);
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
  // Arquivar e excluir: confirma com o texto do plano (o que sai dos meses seguintes) e, se ela
  // confirmar, recalcula com os dados de agora (podem ter mudado durante a pergunta) e grava na
  // fila: primeiro os valores futuros apagados (se houver), depois a conta.
  // Conta que sumiu (ou que não pode mais ser excluída) não quebra a tela: fecha o diálogo e redesenha.
  // `beforeSave` roda logo antes de gravar (o Arquivar fecha o diálogo de edição).
  async function runPlan(makePlan, id, okLabel, beforeSave) {
    const plan = () => {
      try {
        return makePlan(store.getData(), ctx.now(), id);
      } catch {
        closeDialog();
        render();
        return null;
      }
    };
    const first = plan();
    if (!first) return false;
    const ok = await confirmDialog(first.message, okLabel);
    if (!ok || !alive) return false;
    const current = plan();
    if (!current) return false;
    if (beforeSave) beforeSave();
    if (current.entries.length > 0) store.saveEntries(current.entries);
    store.saveAccount(current.account);
    return true;
  }

  // Depois de reativar ou excluir, a linha some das Arquivadas: o foco vai para a próxima ação
  // da seção (ou o título dela) e, se a seção sumiu, para "Nova conta".
  function focusAfterArchivedChange() {
    if (!alive) return;
    const active = document.activeElement;
    if (active && active !== document.body && content.contains(active)) return;
    const target =
      content.querySelector('.archived .st-row button') ||
      content.querySelector('.archived summary') ||
      content.querySelector('[data-new-account]');
    if (target) target.focus();
  }

  function reactivateAccount(account) {
    store.saveAccount(reactivate(account));
    focusAfterArchivedChange();
  }

  async function deleteAccount(id) {
    if (await runPlan(deletePlan, id, 'Excluir')) focusAfterArchivedChange();
  }

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

  function setListSize(value) {
    if (value < MIN_LIST_SIZE || value > MAX_LIST_SIZE) return;
    store.saveSettings({ purchaseListSize: value });
  }

  // Desfazer: confirma com o texto do buildUndo (valor que sai e meses que mudaram) e,
  // se ela confirmar, recalcula com os dados de agora (podem ter mudado durante a pergunta).
  // Compra já desfeita (ou que sumiu) não quebra a tela: só redesenha a lista.
  async function undoPurchase(id) {
    let plan;
    try {
      plan = buildUndo(store.getData(), ctx.now(), id);
    } catch {
      render();
      return;
    }
    const ok = await confirmDialog(plan.message, 'Desfazer');
    if (!ok || !alive) return;
    try {
      plan = buildUndo(store.getData(), ctx.now(), id);
    } catch {
      render();
      return;
    }
    store.savePurchase({ purchase: plan.purchase, entries: plan.entries });
    ctx.notify('Compra desfeita.');
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
    if (archived.length === 0) archivedOpen = false; // a próxima arquivada começa com a seção fechada

    // Entradas e Contas são listas separadas (como na tela Mês); as setas valem dentro de cada uma.
    const rowsOf = (list) => list.map((account, i) => {
      const meta = `${typeLabel(account.type)} · ${
        Number.isInteger(account.defaultAmount) ? formatMoney(account.defaultAmount) : 'sem valor padrão'
      }`;
      const card = isCard(account);
      return h(
        'li',
        { class: 'st-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'account-btn',
            'data-account': account.id,
            'aria-label': `Editar ${account.name}${card ? ', cartão' : ''}. ${meta}`,
            onclick: () => openAccountDialog(account)
          },
          h('span', { class: 'account-name' }, account.name, card && h('span', { class: 'card-tag' }, 'cartão')),
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
                  onclick: () => reactivateAccount(account)
                },
                'Reativar'
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'link danger',
                  'aria-label': `Excluir ${account.name}`,
                  onclick: () => deleteAccount(account.id)
                },
                'Excluir'
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

  // Controle − n + (Próximos meses e Últimas compras). Os aria-labels são únicos na tela:
  // é por eles que o foco volta ao botão depois de redesenhar.
  function stepper({ value, min, max, label, less, more, onChange }) {
    return h(
      'div',
      { class: 'stepper', role: 'group', 'aria-label': label },
      h('button', {
        type: 'button',
        class: 'step-btn',
        'aria-label': less,
        disabled: value <= min,
        onclick: () => onChange(value - 1)
      }, '−'),
      h('span', { class: 'step-value', 'aria-live': 'polite' }, String(value)),
      h('button', {
        type: 'button',
        class: 'step-btn',
        'aria-label': more,
        disabled: value >= max,
        onclick: () => onChange(value + 1)
      }, '+')
    );
  }

  function horizonSection(settings) {
    return h(
      'section',
      { class: 'st-section' },
      h('h2', {}, 'Próximos meses'),
      h('p', { class: 'st-note' }, 'Quantos meses aparecem no Mês e na tela Posso comprar?'),
      stepper({
        value: currentHorizon(settings),
        min: MIN_HORIZON,
        max: MAX_HORIZON,
        label: 'Quantidade de meses',
        less: 'Menos um mês',
        more: 'Mais um mês',
        onChange: setHorizon
      })
    );
  }

  // Últimas compras lançadas pelo "Vou comprar" e ainda não desfeitas, cada uma com "Desfazer".
  function purchasesSection(data, settings) {
    const size = currentListSize(settings);
    const items = recentPurchases(data, size);
    const list = items.length
      ? h(
          'ul',
          { class: 'st-list' },
          ...items.map((item) =>
            h(
              'li',
              { class: 'st-row' },
              h(
                'span',
                { class: 'account-static' },
                h('span', { class: 'account-name' }, item.title),
                h('span', { class: 'account-meta' }, item.detail)
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'link',
                  'data-purchase': item.id,
                  'aria-label': `Desfazer ${item.title}`,
                  onclick: () => undoPurchase(item.id)
                },
                'Desfazer'
              )
            )
          )
        )
      : h('p', { class: 'st-note' }, 'Nenhuma compra lançada pelo Posso comprar?.');
    return h(
      'section',
      { class: 'st-section' },
      h('h2', {}, 'Últimas compras'),
      list,
      h('p', { class: 'st-note st-list-size' }, 'Mostrar as últimas'),
      stepper({
        value: size,
        min: MIN_LIST_SIZE,
        max: MAX_LIST_SIZE,
        label: 'Quantidade de compras na lista',
        less: 'Mostrar uma compra a menos',
        more: 'Mostrar uma compra a mais',
        onChange: setListSize
      })
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
    node.getAttribute('data-purchase') ||
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
      purchasesSection(data, settings),
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
