// Shared browser/installed-Windows test; exercises real React controls.
export async function verifyPrintTemplates(evaluate) {
  const pause = () => new Promise(resolve => setTimeout(resolve, 150));
  async function run(fn, ...args) {
    const result = await evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
    await pause();
    return result;
  }
  async function click(text, dialog = false) {
    const ok = await run((text, dialog) => {
      const root = dialog ? [...document.querySelectorAll('[role="dialog"]')].at(-1) : [...document.querySelectorAll('section')].find(s => s.textContent.includes('Invoice & quotation templates'));
      const button = [...(root?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === text && !b.disabled);
      button?.click(); return !!button;
    }, text, dialog);
    if (!ok) throw new Error('PRINT_TEMPLATE button missing: ' + text);
  }
  async function field(label, value, dialog = false) {
    const ok = await run((label, value, dialog) => {
      const root = dialog ? [...document.querySelectorAll('[role="dialog"]')].at(-1) : [...document.querySelectorAll('section')].find(s => s.textContent.includes('Invoice & quotation templates'));
      const input = [...(root?.querySelectorAll('label') || [])].find(l => l.textContent.trim().startsWith(label))?.querySelector('input');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); return true;
    }, label, value, dialog);
    if (!ok) throw new Error('PRINT_TEMPLATE field missing: ' + label);
  }
  await click('Duplicate');
  await field('Template name', 'QA Print Copy');
  await field('Document heading', 'QA PRINT HEADING');
  await click('Save template');
  await click('Cancel', true);
  await click('Save template');
  await click('Confirm save', true);
  await click('Preview');
  const preview = await run(() => {
    const iframe = document.querySelector('[role="dialog"] iframe');
    return { html: iframe?.srcdoc || '', sandbox: iframe?.getAttribute('sandbox') };
  });
  if (!preview.html.includes('QA PRINT HEADING') || !preview.html.includes('Sample Customer') || preview.sandbox !== '') throw new Error('PRINT_TEMPLATE preview content/sandbox failure');
  await click('Close', true);
  await click('Delete');
  const disabled = await run(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Confirm delete')?.disabled);
  if (!disabled) throw new Error('PRINT_TEMPLATE delete must require typed confirmation');
  await field('Type DELETE', 'DELETE', true);
  await click('Confirm delete', true);
  await click('Restore professional defaults');
  await field('Type RESET', 'RESET', true);
  await click('Confirm reset', true);
  const restored = await run(() => [...document.querySelectorAll('section')].find(s => s.textContent.includes('Invoice & quotation templates'))?.textContent || '');
  if (restored.includes('QA Print Copy') || !restored.includes('Professional default templates restored.')) throw new Error('PRINT_TEMPLATE reset failed');
  console.log('PRINT_TEMPLATE_PREVIEW_EDIT_DUPLICATE_DELETE_RESET PASS');
}
