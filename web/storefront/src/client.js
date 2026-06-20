const productPayload = JSON.parse(document.querySelector('#product-data')?.textContent || '{"products":[]}');
const products = productPayload.products || [];
const productBySku = new Map(products.map((product) => [product.sku.toUpperCase(), product]));
const sessionId = `storefront-${crypto.randomUUID()}`;
const cartStorageKey = 'techparts-storefront-cart';

const searchInput = document.querySelector('#catalog-search');
const categoryFilter = document.querySelector('#category-filter');
const cards = Array.from(document.querySelectorAll('.product-card'));
const emptyState = document.querySelector('#empty-state');
const cartCount = document.querySelector('#cart-count');
const cartItems = document.querySelector('#cart-items');
const cartTotal = document.querySelector('#cart-total');
const clearCartButton = document.querySelector('#clear-cart');
let activeCategory = 'All';

function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(cartStorageKey) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCart(cart) {
  localStorage.setItem(cartStorageKey, JSON.stringify(cart));
}

function addToCart(sku, quantity = 1) {
  const normalizedSku = sku.toUpperCase();
  const product = productBySku.get(normalizedSku);
  if (!product) return null;
  if (product.stock <= 0) return null;

  const cart = readCart();
  const current = Number(cart[normalizedSku] || 0);
  cart[normalizedSku] = Math.min(current + quantity, product.stock);
  writeCart(cart);
  renderCart();
  return product;
}

function removeFromCart(sku) {
  const cart = readCart();
  delete cart[sku.toUpperCase()];
  writeCart(cart);
  renderCart();
}

function clearCart() {
  writeCart({});
  renderCart();
}

function renderCart() {
  const cart = readCart();
  const entries = Object.entries(cart)
    .map(([sku, quantity]) => ({ product: productBySku.get(sku), quantity: Number(quantity) }))
    .filter((entry) => entry.product && entry.quantity > 0);
  const itemCount = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const total = entries.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0);

  cartCount.textContent = String(itemCount);
  cartTotal.textContent = `$${total.toFixed(2)}`;
  cartItems.replaceChildren();

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'cart-empty';
    empty.textContent = 'Your cart is empty.';
    cartItems.append(empty);
    return;
  }

  for (const { product, quantity } of entries) {
    const row = document.createElement('div');
    row.className = 'cart-row';

    const detail = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = product.name;
    const meta = document.createElement('div');
    meta.className = 'cart-meta';
    meta.textContent = `${product.sku} - ${quantity} x $${product.price.toFixed(2)}`;
    detail.append(title, meta);

    const subtotal = document.createElement('strong');
    subtotal.textContent = `$${(product.price * quantity).toFixed(2)}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.removeSku = product.sku;
    remove.textContent = 'Remove';

    row.append(detail, subtotal, remove);
    cartItems.append(row);
  }
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  for (const card of cards) {
    const matchesQuery = !query || card.dataset.search.includes(query);
    const matchesCategory = activeCategory === 'All' || card.dataset.category === activeCategory;
    const show = matchesQuery && matchesCategory;
    card.closest('.product-grid-item').style.display = show ? '' : 'none';
    if (show) visible += 1;
  }
  emptyState.style.display = visible ? 'none' : 'block';
}

searchInput?.addEventListener('input', applyFilters);
categoryFilter?.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  activeCategory = chip.dataset.category;
  for (const item of categoryFilter.querySelectorAll('[data-category]')) {
    item.classList.toggle('MuiChip-filled', item === chip);
    item.classList.toggle('MuiChip-outlined', item !== chip);
    item.classList.toggle('MuiChip-colorPrimary', item === chip);
    item.classList.toggle('MuiChip-colorDefault', item !== chip);
  }
  applyFilters();
});

document.addEventListener('click', (event) => {
  const addButton = event.target.closest('[data-sku].add-to-cart, .chat-action[data-sku]');
  if (addButton) {
    const product = addToCart(addButton.dataset.sku);
    if (product) announceCartAction(`Added ${product.name} to the cart.`);
  }

  const removeButton = event.target.closest('[data-remove-sku]');
  if (removeButton) {
    removeFromCart(removeButton.dataset.removeSku);
  }
});

clearCartButton?.addEventListener('click', clearCart);

const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatLog = document.querySelector('#chat-log');

function appendMessage(role, text) {
  const message = document.createElement('div');
  message.className = `chat-message ${role}`;
  message.textContent = text;
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}

function appendTool(kind, data) {
  const tool = document.createElement('details');
  tool.className = `chat-tool${kind === 'result' ? ' result' : ''}`;
  tool.open = true;

  const summary = document.createElement('summary');
  const label = document.createElement('span');
  label.className = 'tool-name';
  label.textContent = kind === 'result' ? `${data.name} -> result` : `${data.name}()`;
  const who = document.createElement('span');
  who.className = 'tool-agent';
  who.textContent = `by ${data.agent || 'agent'}`;
  summary.append(document.createTextNode(kind === 'result' ? 'ok ' : 'call '), label, document.createTextNode(' '), who);

  const body = document.createElement('pre');
  body.textContent = JSON.stringify(kind === 'result' ? data.response : data.args, null, 2);
  tool.append(summary, body);
  chatLog.append(tool);
  chatLog.scrollTop = chatLog.scrollHeight;
  return tool;
}

function announceCartAction(text) {
  appendMessage('assistant', text);
}

function appendSkuActions(message, skus) {
  const knownSkus = Array.from(new Set(skus.map((sku) => sku.toUpperCase()))).filter((sku) => productBySku.has(sku));
  if (!knownSkus.length) return;

  const actions = document.createElement('div');
  actions.className = 'chat-actions';
  for (const sku of knownSkus.slice(0, 4)) {
    const product = productBySku.get(sku);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-action';
    button.dataset.sku = sku;
    button.textContent = `Add ${product.sku}`;
    actions.append(button);
  }
  message.append(actions);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function extractKnownSkus(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const matches = text.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/gi) || [];
  return matches.filter((sku) => productBySku.has(sku.toUpperCase()));
}

function parseLocalCartCommand(message) {
  if (!/\bcart\b/i.test(message) && !/\badd\b/i.test(message)) return null;
  const sku = extractKnownSkus(message)[0];
  return sku ? sku.toUpperCase() : null;
}

function parseSse(buffer) {
  const messages = [];
  let rest = buffer;
  let boundary = rest.indexOf('\n\n');
  while (boundary !== -1) {
    const raw = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    const event = raw.split('\n').find((line) => line.startsWith('event: '))?.slice(7);
    const dataLine = raw.split('\n').find((line) => line.startsWith('data: '));
    if (event && dataLine) messages.push({ event, data: JSON.parse(dataLine.slice(6)) });
    boundary = rest.indexOf('\n\n');
  }
  return { messages, rest };
}

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = '';
  appendMessage('user', message);

  const localSku = parseLocalCartCommand(message);
  if (localSku) {
    const product = addToCart(localSku);
    appendMessage('assistant', product ? `Added ${product.name} to the cart.` : `I could not add ${localSku} to the cart.`);
    return;
  }

  const pending = appendMessage('assistant', 'Thinking and calling the right specialist agents...');
  const candidateSkus = [];

  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalText = '';
    const trace = [];

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSse(buffer);
      buffer = parsed.rest;
      for (const packet of parsed.messages) {
        if (packet.event === 'tool_call') {
          trace.push(`Calling ${packet.data.name}`);
          pending.textContent = trace.join(' - ');
          appendTool('call', packet.data);
        }
        if (packet.event === 'tool_result') {
          candidateSkus.push(...extractKnownSkus(packet.data.response));
          appendTool('result', packet.data);
        }
        if (packet.event === 'text') {
          finalText += packet.data.text;
          pending.textContent = finalText;
          candidateSkus.push(...extractKnownSkus(packet.data.text));
        }
        if (packet.event === 'error') {
          pending.textContent = packet.data.message || 'Assistant error';
        }
      }
    }
    appendSkuActions(pending, candidateSkus);
  } catch (error) {
    pending.textContent = `Could not reach the orchestrator: ${error.message}`;
  }
});

renderCart();
