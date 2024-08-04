# Changelog


## 0.3.2 - 2024-08-04

### Added

- Add test for semantic tokens and signature help.

### Changed

- Increase tsconfig target to ES2022.
- Activate `noImplicitAny` rule. Adjust code accordingly. Improve typing.
- Update `package-lock.json`.

### Fixed

- Keep preview transform (translation and zoom) when changing preview option or resizing preview.
- Fix tmLanguage to support whitespace between delimited arguments.
- Fix bug causing empty semantic tokens.
- Fix bugs in test setup and improve tests.
- Fix server crash caused by binary .mf files (#1).


## 0.3.1 - 2024-05-20

### Changed

- Add TypeScript rule `noUncheckedIndexedAccess` to increase type safety and hopefully avoid crashes like the one fixed by this update.
- Update the code to be in compliance with the new rule.
- Minor code and typing improvements.

### Fixed

- Fix language server crash caused by `params` with length 0.


## 0.3.0 - 2024-05-19

### Added

- Add walkthrough to README.
- Add signature help support.
- Add support for input files outside workspace, using `kpsewhich` to find them.
- Add basic testing support.
- Add `step`, `until`, `begingroup`, `endgroup` and `quote` to rules of syntax and semantic highlighting.
- Add semantic highlighting for commands and types.
- Add semantic token scopes to `package.json`.

### Changed

- Improve rules for identifying macros in `metafont.tmLanguage.yaml`.
- Improve pattern for indentation rules.
- Set initial visibility of the debug expression preview view, glyph table view and glyph preview view to collapsed.
- Add `comma-spacing` linting rule.
- Small code improvements.

### Fixed

- Fix bug causing empty debug expression preview.
- Fix rule for `$` in `metafont.tmLanguage.yaml`.
- Fix colon rules of loops in ligtable commands.


## 0.2.0 - 2024-04-21

### Added

- Add options for default visibility of box, labels, paths and picture for glyph overview as well as font preview.
- Add file decoration showing the file category.
- Add support for drag&drop of inputs to categories in file overview in project explorer.

### Fixed

- Fix bug showing all glyphs on top of each other if file/line of current cursor is unknown.
- Fix scaling bug in font preview.
- Improve scaling geometry previews.
- Fix hidden elements in previews by drawing pictures first.


## 0.1.0 - 2024-02-18

### Added

- Add support for go to definition for macros and synonyms (`let`).
- Add support for completion proposals.
- All files are scanned on opening a workspace, a progress reporter provides progress info.
- Pass identifiers to input files and use identifiers from input files.
- Show inputs (inputted files and inputting files) in the file tree view.
- Add debug configuration snipped to debug the default job.
- Add this Changelog.
- Add `get-default-job` command.

### Changed

- Update README, `.gitignore` and linting rules.
- Use default path in `.mf-project` file.
- Various small code improvements.

### Fixed

- Fix scaling bug in the glyph overview after changing the size of the glyphs e.g. due to a different mode.
- Fix bugs in debugger caused by `%CAPSULE`s.
- Add missing identifier info of identifiers from conditionals (e.g. defined or inputted in the conditional text of an `if`).
- The document manager is now aware of all `.mf` files to link files according to `input`s.
- Fix go to declaration of macros.
- Fix parameters in hovers of macros.
- Add missing keywords to parser e.g. for semantic highlighting.
- Highlight filenames of input synonyms correctly (e.g. after Computer Modern's `generate`).
- Keep info of closed documents as they can still be used in an `input`.
- Multiple fixes of parse mode.
- Ignore tokens identified in file names.
- Remove unused files from packaged `.vsix` files by modifying `.vscodeignore`.


## 0.0.1 - 2024-02-04

first release

- Multiple previews (geometry and table previews).
- Language features (syntax highlighting, basic semantic highlighting, etc.).
- Debugger with limited functionality.
