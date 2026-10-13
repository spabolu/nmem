import { Blankslate } from "@primer/react/experimental";

export function BadQuery({ what }: { readonly what: string }) {
  return (
    <main id="main" className="page wide" data-view="bad">
      <Blankslate>
        <Blankslate.Heading>
          This address asks for something nmem cannot show
        </Blankslate.Heading>
        <Blankslate.Description>{what}</Blankslate.Description>
      </Blankslate>
    </main>
  );
}
