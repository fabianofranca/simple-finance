// Tela Check-in: saldo em conta e duas perguntas (contas pagas, salário caiu).
// Regras em src/checkin.js; aqui só se monta a tela.
import { checkinForm, canConfirm, buildCheckin, dropNotice, localDay } from '../checkin.js';
import { formatInput, parseMoney } from '../money.js';
import { monthName } from '../month-view.js';

const SNOOZE_KEY = 'sf.snooze';

// Elemento com texto sempre via textContent (nunca innerHTML com dados).
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

// Par de botões grandes "sim / ainda não" que se comportam como um grupo de opções.
function choiceRow({ id, label, yesText, onChange, preset }) {
  let value = preset;
  const labelEl = h('div', { class: 'checkin-label', id: `${id}-label`, text: label });
  const yes = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', text: yesText });
  const no = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', text: 'Ainda não' });
  const paint = () => {
    yes.setAttribute('aria-pressed', String(value === true));
    no.setAttribute('aria-pressed', String(value === false));
  };
  const pick = (v) => () => {
    value = v;
    paint();
    onChange(v);
  };
  yes.addEventListener('click', pick(true));
  no.addEventListener('click', pick(false));
  paint();
  return h(
    'div',
    { class: 'checkin-row', role: 'group', 'aria-labelledby': labelEl.id },
    labelEl,
    h('div', { class: 'choices' }, yes, no),
  );
}

function snoozeToday(now) {
  try {
    localStorage.setItem(SNOOZE_KEY, localDay(now));
  } catch {
    // sem acesso ao storage: o "Agora não" vale só até a próxima abertura
  }
}

export function mount(el, ctx) {
  const auto = Boolean(ctx.params && ctx.params.auto);
  let alive = true;
  let built = false;

  function build(data) {
    built = true;
    const form = checkinForm(data, ctx.now());
    const hasPrevious = (data.checkins || []).length > 0;
    const answers = {
      balance: form.balance,
      billsPaid: form.bills.preset === null ? undefined : form.bills.preset,
      incomeReceived: form.income.preset === null ? undefined : form.income.preset,
    };
    const name = monthName(form.month);

    const title = h('h1', { text: `Como está ${name}?` });

    // Saldo: campo de texto com teclado decimal; "±" troca o sinal (o teclado do iPhone não tem "-").
    const input = h('input', {
      id: 'checkin-balance',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      placeholder: '0,00',
    });
    if (form.balance !== null) input.value = formatInput(form.balance);
    const sign = h('button', { type: 'button', class: 'sign', 'aria-label': 'Trocar o sinal', text: '±' });
    const balanceBox = h(
      'div',
      { class: 'checkin-row' },
      h('label', { for: 'checkin-balance', text: 'Na conta' }),
      h('div', { class: 'balance' }, h('span', { class: 'currency', 'aria-hidden': 'true', text: 'R$' }), input, sign),
    );

    const confirm = h('button', { type: 'button', class: 'confirm', text: 'Confirmar' });
    const refresh = () => {
      answers.balance = parseMoney(input.value, { allowNegative: true });
      confirm.disabled = !canConfirm(form, answers);
    };

    input.addEventListener('input', refresh);
    sign.addEventListener('click', () => {
      const text = input.value.trim();
      input.value = /^[-−]/.test(text) ? text.replace(/^[-−]\s*/, '') : `-${text}`;
      refresh();
      input.focus();
    });

    const rows = [balanceBox];
    if (form.bills.show) {
      rows.push(choiceRow({
        id: 'bills',
        label: `Contas de ${name}`,
        yesText: 'Já paguei',
        preset: form.bills.preset,
        onChange: (v) => { answers.billsPaid = v; refresh(); },
      }));
    }
    if (form.income.show) {
      rows.push(choiceRow({
        id: 'income',
        label: `Salário de ${name}`,
        yesText: 'Já caiu',
        preset: form.income.preset,
        onChange: (v) => { answers.incomeReceived = v; refresh(); },
      }));
    }

    // Volta ao Mês sem deixar o check-in no "voltar".
    const leave = () => ctx.navigate('#mes', { replace: true });

    let done = false;
    confirm.addEventListener('click', () => {
      refresh();
      if (done || confirm.disabled) return;
      done = true;
      const previous = ctx.store.getData();
      const checkin = buildCheckin(previous, ctx.now(), answers);
      const notice = dropNotice(previous, checkin); // antes de gravar, com os dados anteriores
      ctx.store.saveCheckin(checkin);
      if (notice) ctx.notify(notice.text);
      leave();
    });

    const actions = h('div', { class: 'checkin-actions' }, confirm);
    if (auto && hasPrevious) {
      const later = h('button', { type: 'button', class: 'later', text: 'Agora não' });
      later.addEventListener('click', () => {
        snoozeToday(ctx.now());
        leave();
      });
      actions.append(later);
    } else if (!auto) {
      const back = h('button', { type: 'button', class: 'later', text: 'Voltar' });
      back.addEventListener('click', leave);
      actions.append(back);
    }

    el.replaceChildren(h('section', { class: 'checkin' }, title, ...rows, actions));
    refresh();
  }

  // Sem dados ainda: "Carregando…" e monta quando o store avisar.
  const tryBuild = () => {
    if (!alive || built) return;
    const data = ctx.store.getData();
    if (data) build(data);
  };

  el.replaceChildren(h('section', { class: 'checkin' }, h('p', { text: 'Carregando…' })));
  const unsubscribe = ctx.store.subscribe(tryBuild);
  tryBuild();

  return function unmount() {
    alive = false;
    unsubscribe();
    el.replaceChildren();
  };
}
