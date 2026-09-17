'use client';

import { Children, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

// Shared, touch-friendly select. A hidden native select keeps ordinary form
// serialization, reset, validation and React change events working.
export default function Select({ children, value, defaultValue, onChange, id, className = '', disabled, ...props }) {
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const generatedId = useId();
  const controlId = id || generatedId;
  const native = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const typeahead = useRef({ text: '', time: 0 });
  const options = Children.toArray(children).filter(Boolean);
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.props.value ?? '');
  const currentValue = value ?? internalValue;
  const selected = options.findIndex((option) => String(option.props.value) === String(currentValue));
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const [position, setPosition] = useState({});
  const [invalid, setInvalid] = useState(false);

  function close() { setOpen(false); }
  function reposition() {
    const rect = trigger.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const upwards = below < 200 && above > below;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: Math.min(rect.width, window.innerWidth - 16),
      ...(upwards ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      maxHeight: Math.max(80, Math.min(420, upwards ? above : below)) });
  }
  function show() {
    if (disabled || trigger.current?.matches(':disabled')) return;
    reposition();
    setFocused(Math.max(0, selected));
    setOpen(true);
  }
  function choose(index) {
    const option = options[index];
    if (!option || option.props.disabled || native.current?.matches(':disabled')) return;
    native.current.value = String(option.props.value);
    native.current.dispatchEvent(new Event('change', { bubbles: true }));
    setInvalid(false);
    close();
    trigger.current.focus();
  }
  function keyDown(event) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      const step = event.key === 'ArrowUp' ? -1 : 1;
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : focused + step;
      while (next >= 0 && next < options.length && options[next].props.disabled) next += step;
      if (next >= 0 && next < options.length) setFocused(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(focused); else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text = (now - typeahead.current.time > 700 ? '' : typeahead.current.text) + event.key.toLocaleLowerCase();
      typeahead.current = { text, time: now };
      const next = options.findIndex((option) => !option.props.disabled && native.current.options[options.indexOf(option)]?.text.toLocaleLowerCase().startsWith(text));
      if (!open) show();
      if (next >= 0) setFocused(next);
    }
  }
  useEffect(() => {
    if (!open) return;
    function outside(event) { if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close(); }
    function scroll(event) {
      if (menu.current?.contains(event.target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) close();
      else reposition();
    }
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', scroll, true); };
  }, [open]);
  useEffect(() => {
    const list = menu.current, item = list?.children[focused];
    if (!open || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [focused, open]);
  useEffect(() => {
    const form = native.current?.form;
    function reset() { setInternalValue(defaultValue ?? options[0]?.props.value ?? ''); setInvalid(false); close(); }
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [defaultValue, children]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span className={`shared-select ${className}`}>
    <button ref={trigger} id={controlId} type="button" role="combobox" className="shared-select-trigger" disabled={disabled || !hydrated}
      aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']}
      aria-expanded={open && !disabled} aria-haspopup="listbox" aria-controls={`${controlId}-options`}
      aria-activedescendant={open ? `${controlId}-option-${focused}` : undefined} aria-invalid={invalid || undefined} aria-required={props.required || undefined}
      onClick={() => open ? close() : show()} onKeyDown={keyDown}>
      <span>{options[selected]?.props.children || '\u00a0'}</span><span className="shared-select-chevron" aria-hidden="true" />
    </button>
    <select {...props} ref={native} id={`${controlId}-native`} hidden aria-hidden="true" tabIndex={-1} disabled={disabled}
      value={currentValue} onInvalid={(event) => { event.preventDefault(); setInvalid(true); trigger.current.focus(); }}
      onChange={(event) => { setInternalValue(event.target.value); onChange?.(event); }}>{children}</select>
    {open && !disabled && createPortal(<div ref={menu} id={`${controlId}-options`} role="listbox" className="shared-select-options" style={position}
      aria-label={props['aria-label']} aria-labelledby={props['aria-label'] ? undefined : controlId}>
      {options.map((option, index) => <div key={String(option.props.value)} id={`${controlId}-option-${index}`} role="option"
        aria-selected={index === selected} aria-disabled={option.props.disabled || undefined}
        className={`${index === focused ? 'is-focused' : ''} ${index === selected ? 'is-selected' : ''}`}
        onPointerDown={(event) => event.preventDefault()} onMouseMove={() => !option.props.disabled && setFocused(index)} onClick={() => choose(index)}>{option.props.children}</div>)}
    </div>, document.body)}
  </span>;
}
