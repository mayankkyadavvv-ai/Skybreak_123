export function trapFocus(event,container){
  if(event.key!=='Tab' && event.code!=='Tab')return;
  const items=[...container.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select,textarea,summary,[tabindex="0"]')].filter(el=>!el.hidden&&!el.closest('[hidden]'));
  if(!items.length){event.preventDefault();container.focus();return;}
  const first=items[0],last=items.at(-1),active=container.ownerDocument.activeElement;
  if(event.shiftKey && (active===first || !container.contains(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey && (active===last || !container.contains(active))){event.preventDefault();first.focus();}
}
export const escapeHTML=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
