'use client';
import { useActionState } from 'react';
import { loginAction, type FormState } from '../actions';

const input = 'mt-1 h-12 w-full rounded-lg border border-line bg-surface px-3 text-[16px] focus:border-gold focus:outline-none';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, {} as FormState);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.message && <p role="alert" className="rounded-lg border border-red-400/60 bg-red-400/10 p-3 text-sm text-red-200">{state.message}</p>}
      <div><label htmlFor="email" className="text-sm">Email</label><input key={state.values?.email} id="email" name="email" type="email" autoComplete="username" required defaultValue={state.values?.email} className={input} /></div>
      <div><label htmlFor="password" className="text-sm">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className={input} /></div>
      <button disabled={pending} className="h-12 w-full rounded-lg bg-gold font-semibold text-ground hover:bg-gold-soft disabled:opacity-60">{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
