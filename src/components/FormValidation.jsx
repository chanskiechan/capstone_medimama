import { useEffect } from 'react';

const message = 'Please fill up this required field.';
const registrationRequired = new Set(['firstName', 'lastName', 'address', 'birthdate', 'contact', 'email', 'validId', 'password', 'confirmPassword', 'terms', 'relationship', 'linkedPatient', 'emergency', 'caregiverConsent']);

function validationHost(field) {
  return field.closest('label') || field.closest('.mm-input') || field.parentElement;
}

function clearField(field) {
  field.removeAttribute('data-validation-error');
  validationHost(field)?.removeAttribute('data-validation-error');
  field.removeAttribute('aria-invalid');
}

function markField(field) {
  field.setAttribute('data-validation-error', 'true');
  validationHost(field)?.setAttribute('data-validation-error', message);
  field.setAttribute('aria-invalid', 'true');
}

function isEmpty(field) {
  if (field.type === 'file') return !field.files?.length;
  if (field.type === 'checkbox' || field.type === 'radio') return !field.checked;
  return !String(field.value || '').trim();
}

function isInvalid(field, form) {
  if (field.disabled) return false;
  if (field.required) return !field.validity.valid;
  if (!form.closest('.mm-signup') || !registrationRequired.has(field.name)) return false;
  if (isEmpty(field)) return true;
  if (field.name === 'contact' || field.name === 'emergency') return !/^9\d{9}$/.test(field.value);
  return !field.validity.valid;
}

function clearForm(form) {
  form.removeAttribute('data-validation-invalid');
  form.querySelectorAll('input, select, textarea').forEach(field => {
    if (!isInvalid(field, form)) clearField(field);
  });
}

function resetForm(form) {
  form.removeAttribute('data-validation-invalid');
  form.querySelectorAll('input, select, textarea').forEach(clearField);
}

export default function FormValidation() {
  useEffect(() => {
    const onInvalid = event => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !field.form) return;
      const form = field.form;
      form.setAttribute('data-validation-invalid', 'true');
      form.querySelectorAll('input, select, textarea').forEach(control => {
        if (isInvalid(control, form)) markField(control);
      });
    };

    const onInput = event => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !field.form) return;
      if (!isInvalid(field, field.form)) clearField(field);
      const hasInvalid = Array.from(field.form.querySelectorAll('input, select, textarea')).some(control => isInvalid(control, field.form));
      if (!hasInvalid) clearForm(field.form);
    };

    const onClick = event => {
      const button = event.target.closest?.('button');
      if (!button || !button.closest('.mm-switch')) return;
      document.querySelectorAll('form').forEach(resetForm);
    };

    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onInput, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
