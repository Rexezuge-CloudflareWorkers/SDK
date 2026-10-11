import { describe, expect, it } from 'vitest';
import { mergeDuplicateImports, rewriteComponentImports } from './web-components';

describe('rewriteComponentImports', () => {
  it('moves a converged component onto @rexezuge/web', () => {
    const source = "import { AppPage } from '../components/layout/AppPage';";
    const result = rewriteComponentImports(source);
    expect(result.output).toBe("import { AppPage } from '@rexezuge/web';");
    expect(result.changed).toStrictEqual(['AppPage']);
  });

  it('ignores the directory the component sits in', () => {
    // The same component name appeared under `layout/`, `shared/` and
    // `modals/` across the family.
    for (const dir of ['layout', 'shared', 'modals', 'ui']) {
      expect(rewriteComponentImports(`import { AppPage } from '../components/${dir}/AppPage';`).output).toBe(
        "import { AppPage } from '@rexezuge/web';",
      );
    }
  });

  it('ignores the relative prefix', () => {
    for (const prefix of ['./', '../', '../../', '../../../']) {
      expect(rewriteComponentImports(`import { AppPage } from '${prefix}components/layout/AppPage';`).output).toBe(
        "import { AppPage } from '@rexezuge/web';",
      );
    }
  });

  it('handles a components directory at the root of the path', () => {
    expect(rewriteComponentImports("import { AppPage } from './components/AppPage';").output).toBe(
      "import { AppPage } from '@rexezuge/web';",
    );
  });

  it('preserves the quote style rather than reformatting the file', () => {
    const result = rewriteComponentImports('import { AppPage } from "../components/layout/AppPage";');
    expect(result.output).toBe('import { AppPage } from "@rexezuge/web";');
  });

  it('rewrites every row in the table', () => {
    const names = [
      'ModalShell',
      'ConfirmDeleteModal',
      'PageState',
      'AppPage',
      'PageHeaderCard',
      'ContextBar',
      'Unauthorized',
      'NoticeBar',
      'LanguageSelector',
      'RefreshButton',
      'ReadOnlyField',
      'TypeToConfirmModal',
    ];
    for (const name of names) {
      const result = rewriteComponentImports(`import { ${name} } from '../components/layout/${name}';`);
      expect(result.output).toBe(`import { ${name} } from '@rexezuge/web';`);
      expect(result.changed).toStrictEqual([name]);
    }
  });

  it('rewrites several components in one file, merging them into one clause', () => {
    const source = [
      "import { AppPage } from '../components/layout/AppPage';",
      "import { RefreshButton } from '../components/shared/RefreshButton';",
      'export const x = 1;',
    ].join('\n');
    const result = rewriteComponentImports(source);
    expect(result.changed).toStrictEqual(['AppPage', 'RefreshButton']);
    expect(result.output).toBe(["import { AppPage, RefreshButton } from '@rexezuge/web';", 'export const x = 1;'].join('\n'));
  });

  it('leaves a component the kit has not converged exactly as it was', () => {
    // A repo-local `components/volume/VolumeCard.tsx`. Rewriting it would point
    // the repo at an export that does not exist.
    const source = "import { VolumeCard } from '../components/volume/VolumeCard';";
    const result = rewriteComponentImports(source);
    expect(result.output).toBe(source);
    expect(result.changed).toStrictEqual([]);
    expect(result.unmapped).toStrictEqual(['VolumeCard']);
  });

  it('does not touch a same-named file reached by some other path', () => {
    // `Card` and `Input` are also the names of things outside `components/`.
    // The pattern requires the literal `components/` segment.
    const source = "import { Card } from '../domain/model/Card';";
    expect(rewriteComponentImports(source).output).toBe(source);
    const bare = "import { AppPage } from './AppPage';";
    expect(rewriteComponentImports(bare).output).toBe(bare);
  });

  it('does not match a longer name that starts with a converged one', () => {
    const source = "import { AppPageHeader } from '../components/layout/AppPageHeader';";
    expect(rewriteComponentImports(source).output).toBe(source);
  });

  it('reports an unmapped component once per run, not once per import', () => {
    const source = [
      "import { VolumeCard } from '../components/volume/VolumeCard';",
      "import { VolumeCard as Other } from '../components/volume/VolumeCard';",
    ].join('\n');
    expect(rewriteComponentImports(source).unmapped).toStrictEqual(['VolumeCard']);
  });

  it('is idempotent', () => {
    const source = [
      "import { AppPage } from '../components/layout/AppPage';",
      "import { RefreshButton } from '../components/shared/RefreshButton';",
    ].join('\n');
    const once = rewriteComponentImports(source).output;
    const twice = rewriteComponentImports(once);
    expect(twice.output).toBe(once);
    expect(twice.changed).toStrictEqual([]);
  });

  it('changes nothing in a file with no component imports', () => {
    const source = ["import { useState } from 'react';", 'export const x = useState(0);'].join('\n');
    const result = rewriteComponentImports(source);
    expect(result.output).toBe(source);
    expect(result.changed).toStrictEqual([]);
  });

  it('rewrites a type-only import', () => {
    const result = rewriteComponentImports("import type { ModalShellProps } from '../components/modals/ModalShell';");
    expect(result.output).toBe("import type { ModalShellProps } from '@rexezuge/web';");
  });
});

describe('mergeDuplicateImports', () => {
  it('collapses two kit clauses into one', () => {
    const source = ["import { AppPage } from '@rexezuge/web';", "import { RefreshButton } from '@rexezuge/web';"].join('\n');
    expect(mergeDuplicateImports(source)).toBe("import { AppPage, RefreshButton } from '@rexezuge/web';");
  });

  it('leaves every other specifier exactly where it was', () => {
    // The point of the narrow scope: an operator's diff should contain the
    // components that moved and nothing else.
    const source = [
      "import { useState } from 'react';",
      "import { AppPage } from '@rexezuge/web';",
      "import { VolumeDAO } from '../dao/VolumeDAO';",
      "import { RefreshButton } from '@rexezuge/web';",
    ].join('\n');
    expect(mergeDuplicateImports(source)).toBe(
      [
        "import { useState } from 'react';",
        "import { AppPage, RefreshButton } from '@rexezuge/web';",
        "import { VolumeDAO } from '../dao/VolumeDAO';",
      ].join('\n'),
    );
  });

  it('merges non-adjacent kit clauses without moving the code between them', () => {
    const source = [
      "import { AppPage } from '@rexezuge/web';",
      "import { VolumeDAO } from '../dao/VolumeDAO';",
      "import { RefreshButton } from '@rexezuge/web';",
    ].join('\n');
    // The unrelated import stays on line 2. Merging pulls the second kit
    // clause's *names* up, never another line's code.
    expect(mergeDuplicateImports(source)).toBe(
      ["import { AppPage, RefreshButton } from '@rexezuge/web';", "import { VolumeDAO } from '../dao/VolumeDAO';"].join('\n'),
    );
  });

  it('dedupes a name imported from two of its old homes', () => {
    // `PageState` exported both `LoadingSpinner` and `EmptyState`.
    const source = [
      "import { LoadingSpinner } from '../components/layout/PageState';",
      "import { EmptyState } from '../components/layout/PageState';",
    ].join('\n');
    expect(rewriteComponentImports(source).output).toBe("import { LoadingSpinner, EmptyState } from '@rexezuge/web';");
  });

  it('never merges a type clause into a value clause', () => {
    // Mixing them would silently drop the type-only guarantee.
    const source = ["import { AppPage } from '@rexezuge/web';", "import type { ModalShellProps } from '@rexezuge/web';"].join('\n');
    expect(mergeDuplicateImports(source)).toBe(source);
  });

  it('leaves a clause containing an `as` rename alone', () => {
    const source = ["import { AppPage as Page } from '@rexezuge/web';", "import { RefreshButton } from '@rexezuge/web';"].join('\n');
    expect(mergeDuplicateImports(source)).toBe(source);
  });

  it('leaves a multi-line import alone rather than reformatting it', () => {
    const source = ['import {', '  AppPage,', "} from '@rexezuge/web';", "import { RefreshButton } from '@rexezuge/web';"].join('\n');
    expect(mergeDuplicateImports(source)).toBe(source);
  });

  it('leaves a default or namespace import alone', () => {
    const source = ["import Web from '@rexezuge/web';", "import { RefreshButton } from '@rexezuge/web';"].join('\n');
    expect(mergeDuplicateImports(source)).toBe(source);
  });

  it('returns the input unchanged when there is nothing to merge', () => {
    const source = ["import { AppPage } from '@rexezuge/web';", "import { X } from '../dao/X';"].join('\n');
    expect(mergeDuplicateImports(source)).toBe(source);
  });

  it('keeps a trailing newline as the file had it', () => {
    expect(mergeDuplicateImports("import { A } from '@rexezuge/web';\n")).toBe("import { A } from '@rexezuge/web';\n");
    expect(mergeDuplicateImports("import { A } from '@rexezuge/web';")).toBe("import { A } from '@rexezuge/web';");
  });
});
