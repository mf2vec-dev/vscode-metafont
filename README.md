# `vscode-metafont`

A Visual Studio Code extension with language and preview support for METAFONT.

- [`vscode-metafont`](#vscode-metafont)
  - [Setup](#setup)
  - [Features](#features)
  - [Motivation and Purpose](#motivation-and-purpose)
  - [Future enhancements](#future-enhancements)
  - [See also](#see-also)
    - [METAPOST focused](#metapost-focused)



## Setup
> [!NOTE]
> This extension will be made available on the VS Code Extension Marketplace soon.

1. clone this repository, change to the new directory
2. `npm install`
3. `vsce package`
4. `code --install-extension vscode-metafont-x.y.z.vsix`


## Features

> [!NOTE]
> Many features are still under development.

- Syntax highlighting
- METAFONT file management\
  In the *MF Files* view, `.mf` files can be grouped in different categories. Parameter files can be marked as default job file to quickly generate proof sheets.
- Preview of:
  - Current glyph (glyph preview)\
    Shows a preview of a glyph depending on your caret's (text cursor's) position. You can lock the reference to keep showing a specific glyph when editing other parts of your code.
  - All glyphs (glyph overview)\
    Provides an overview of all glyphs of the font. 
  - Font (font preview)\
    Test the font including kerning and ligatures.
  - Glyph box dimensions (table)\
    Table of all glyph box dimensions
  - Kerning pairs (table)\
    Table of all kerning pairs
  - Ligatures (table)
    Table of all ligatures

  For all those previews, you can specify a *first line* and a *job file* to preview the output with different parameter files, modes/resolutions, etc. You can also move many previews to separate windows.
- Debugging:\
  Set breakpoints to pause METAFONT on a specific line and inspect variables. Besides showing the values of `numeric`, `pair` and `transform` variables, the debugger also provides a visualization of `path` and `picture` variables and expressions.\
  Currently, debugging inside definitions/macros or loops is not supported.
- Useful commands:\
  This extension provides commands to run METAFONT or generate proof sheet PDFs.

> [!NOTE]
> The previews should update every time you save a METAFONT file or change a preview option. Note that METAFONT needs to re-run in many cases which might take a few seconds. To speed this up, comment out code you are not working on (e.g. all but one program file `input` in the driver file or characters you are not editing).


## Motivation and Purpose

While METAFONT provides an interface for `display`ing characters, it's author acknowledges that other programs are helpful in creating a good font:

> [...] a font must be seen to be believed. Moreover, if some characters of a font are faulty, the best way to fix them is to look at diagrams that indicate what went wrong. Therefore METAFONT is incomplete by itself; additional programs are needed to convert
the output of METAFONT into graphic form.
>
> &mdash; <cite>Donald E. Knuth, The METAFONTbook, p. 327</cite>

In appendix H of The METAFONTbook, Donald E. Knuth discusses two programs, `GFtoDVI` and $\TeX$, to generate proof sheets. While these are great for generating *large scale proofs* and *font samples*, you may want to get a more detailed view of a character's anatomy while designing it. This was the original motivation for this extension.

The development of this extension started in 2019, with the preview based on the `mf2vec` concept (see [the explanations in `mf2ff`'s README](https://github.com/mf2vec-dev/mf2ff?tab=readme-ov-file#mf2vec-concept)). Starting in October 2023, some parts of the extension were re-implemented and many features were added. While it is relatively easy to use METAFONT as an interpreter to provide previews as a special feature of a language extension, it is much more difficult to correctly implement standard language features such as syntax highlighting, semantic highlighting, goto definition, etc. due to the flexibility of the METAFONT language, e.g. `a.b` can be a variable or the use of a macro that takes an undelimited parameter. The macro could be defined in another file that the current file doesn't reference. In other languages you have to `import` everything you want to use. In METAFONT it is much harder to know where and how a symbolic token was defined. Therefore these basic language features may not be as robust as you are used to in other languages.

The developer of this extension hopes that it will help font designers to design and debug fonts and glyphs more easily. Although this may not be an ideal solution, it could be a small step towards Dave Crossland's vision to help METAFONT to catch on:
> Perhaps if there was a graphical user interface
to visualize METAFONT code in near real-time, type
designers who feel writing code is unintuitive could
be more confident about doing so.
>
> &mdash; <cite>Dave Crossland, Why didn't METAFONT catch on?, TUGboat, Volume 29 (2008), No. 3, p. 419</cite>


## Future enhancements

- Code quality\
  This is my first big TypeScript/JavaScript/Node.js project so I'm new to this ecosystem. I hope to learn more and improve the code quality and test coverage along the way. Anyone with more experience is welcome to fix obvious flaws or discuss potential improvements.
- Better efficiency and speed\
  Running METAFONT less frequently for previews and updating them based on unsaved files, may allow for near real-time previews.
- Interactive function testing [maybe]\
  It would be great to be able to test macros interactively, e.g. move around points passed as input (pair value or point suffix) and see how a computed path or filled/drawn picture changes.
- Interactive editing [maybe]\
  This is more challenging, and I'm not sure how it could be done. In many cases, METAFONT's result is based on a combination of parameters, equations, factors or even numerical solutions of nonlinear equations. When the user modifies the visualization, what should be changed? A mechanism to specify what should be changed may be too complicated and some constraints may not be met during editing in the visualizations.


## See also

- [mfcode](https://github.com/CharlesAverill/mfcode) a VSCode extension for METAFONT
- [meta-mode](https://ctan.org/pkg/meta-mode) a GNU Emacs editing mode for METAFONT and METAPOST code by Ulrik Vieth ([TUGboat article](https://www.tug.org/TUGboat/tb18-1/tb54viet.pdf))
- [MetafontMode](https://alphacocoa.sourceforge.io/MetafontModeHelp.html) for the Alpha text editor
- [MetaPreview](https://www.winedt.org/macros/latex/MetaPreview.html) for easy PDF generation within WinEdt editor
- [visualmetafont](https://github.com/DigitalKhatt/visualmetafont)
- [Metaflop](https://www.metaflop.com)
- [Metapolator](http://metapolator.com/)
- [Metapolator](https://github.com/w4v3/metaforge) a FontForge plugin


### METAPOST focused

- [vscode-metapost](https://github.com/fjebaker/vscode-metapost)
- [MEPer](https://cseweb.ucsd.edu/~s1pan/MEPer/) ([CTAN](https://ctan.org/pkg/meper))
- [MPEdit](https://ctan.org/pkg/mpedit)
- [MetaPost Previewer](http://www.tlhiv.org/mppreview/)
- [Metagraf](http://w3.mecanica.upm.es/metapost/metagraf.php)
