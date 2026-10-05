import { Icon } from './icon';
import { SIGN_OUT_PATH } from './shell-paths';

/**
 * "Atsijungti": a button submitting this place's own hidden POST form, as
 * sportbet has one per place (partials/rail-account, header), so `formId`
 * must be unique on the page. Served by 4b.
 */
export function SignOut({
  formId,
  className,
}: {
  formId: string;
  className: string;
}) {
  return (
    <>
      <button type="submit" form={formId} className={className}>
        <Icon name="box-arrow-right" /> Atsijungti
      </button>
      <form id={formId} action={SIGN_OUT_PATH} method="post" hidden />
    </>
  );
}
