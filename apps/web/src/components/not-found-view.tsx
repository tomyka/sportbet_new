import type { JSX } from 'react';
import { BackToList } from './back-to-list';

export function NotFoundView(): JSX.Element {
  return (
    <>
      <h1>Puslapis nerastas</h1>
      <BackToList />
    </>
  );
}
