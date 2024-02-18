# Changelog


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
