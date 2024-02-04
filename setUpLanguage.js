const fs = require('fs');
const jsYaml = require('js-yaml');
const path = require('path');

const yamlFileConversions = [
  {
    inFilePath: 'src/language/metafont.tmLanguage.yaml',
    outFilePath: 'out/language/metafont.tmLanguage.json',
    jsYamlTypes: [
      new jsYaml.Type('!join', {
        kind: 'sequence',
        construct: (sequence) => sequence.join('')
      })
    ],
    // remove patterns and pattern components used to build final patterns using !join
    fileDataFunction: (fileData) => {delete fileData._pattern;}
  }
];


for (let i = 0; i < yamlFileConversions.length; i++) {
  let fileData = jsYaml.load(fs.readFileSync(yamlFileConversions[i].inFilePath, { encoding: 'utf-8' }), { schema: jsYaml.DEFAULT_SCHEMA.extend(yamlFileConversions[i].jsYamlTypes) });

  yamlFileConversions[i].fileDataFunction(fileData);

  // create out parent dir if it doesn't exist
  const parentDir = path.dirname(yamlFileConversions[i].outFilePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(yamlFileConversions[i].outFilePath, JSON.stringify(fileData, undefined, 2));
}
