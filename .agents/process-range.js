const fs = require('fs');

const [inputPath, outputPath, startBatchArgument, endBatchArgument] = process.argv.slice(2);
const startBatch = Number(startBatchArgument);
const endBatch = Number(endBatchArgument);
if (!inputPath || !outputPath || !Number.isInteger(startBatch) || !Number.isInteger(endBatch) || startBatch < 1 || endBatch < startBatch) {
  console.error('Usage: node process-range.js <input-txt> <output-md> <start-batch> <end-batch>');
  process.exit(1);
}

const source = fs.readFileSync(inputPath, 'utf8');
const lines = source
  .split(/\r?\n/)
  .map(line => line.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, ''))
  .filter(line => line.length > 0);

const batches = [];
let currentBatch = [];
let currentChars = 0;
const MAX_LINES = 40;
const MAX_CHARS = 6000;

for (const line of lines) {
  if (currentBatch.length > 0 && (currentBatch.length >= MAX_LINES || currentChars + line.length > MAX_CHARS)) {
    batches.push(currentBatch);
    currentBatch = [];
    currentChars = 0;
  }
  currentBatch.push(line);
  currentChars += line.length;
}
if (currentBatch.length > 0) batches.push(currentBatch);

function buildPrompt(batch) {
  const numbered = batch
    .map((line, index) => `[${index + 1}] ${line}`)
    .join('\n');
  return [
    'You are translating classical Chinese into modern Chinese.',
    'Process every numbered source line below.',
    'For each source line, write one or more output lines.',
    'Every output line must begin with the matching source number in square brackets, such as [1].',
    'Every output line must contain exactly one modern Chinese sentence.',
    'Keep each sentence short and clear.',
    'Explain rare words, names, allusions, and historical context in separate sentences.',
    'Do not output the original classical Chinese.',
    'Do not use tables or ordered lists.',
    'Do not add any notes outside the numbered output lines.',
    'Cover every numbered source line at least once.',
    'Use plain text only.',
    '',
    numbered
  ].join('\n');
}

function parseOutput(text, batchSize) {
  const result = new Map();
  for (let number = 1; number <= batchSize; number++) result.set(number, []);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^\[(\d+)\]\s*(.*)$/);
    if (!match) continue;
    const number = Number(match[1]);
    if (number < 1 || number > batchSize) continue;
    let content = match[2].trim();
    if (!content) continue;
    const punctuation = ['\u3002', '\uff01', '\uff1f', '\uff1a', '\uff1b'];
    if (!punctuation.some(mark => content.endsWith(mark))) {
      content = content + '\u3002';
    }
    result.get(number).push(content);
  }
  return result;
}

async function callModel(prompt) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://zhenze-huhehaote.cmecloud.cn/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.ZHENZE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'glm-5.3',
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: prompt }
              ]
            }
          ],
          reasoning: { effort: 'low' }
        })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`API request failed: ${response.status} ${body}`);
      }
      const data = await response.json();
      const message = data.output.find(item => item.type === 'message');
      if (!message) throw new Error('API response did not contain a message');
      return message.content.map(part => part.text || '').join('\n');
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 5000));
    }
  }
}

async function processBatch(batch, batchIndex) {
  const firstOutput = await callModel(buildPrompt(batch));
  let parsed = parseOutput(firstOutput, batch.length);
  const missing = [];
  for (let number = 1; number <= batch.length; number++) {
    if (parsed.get(number).length === 0) missing.push(number - 1);
  }
  if (missing.length > 0) {
    const missingLines = missing.map(index => batch[index]);
    const retryOutput = await callModel(buildPrompt(missingLines));
    const retryParsed = parseOutput(retryOutput, missingLines.length);
    missing.forEach((sourceIndex, retryIndex) => {
      const texts = retryParsed.get(retryIndex + 1) || [];
      parsed.set(sourceIndex + 1, texts);
    });
  }
  const stillMissing = [];
  for (let number = 1; number <= batch.length; number++) {
    if (parsed.get(number).length === 0) stillMissing.push(number);
  }
  if (stillMissing.length > 0) {
    throw new Error(`Batch ${batchIndex + 1} still missing lines: ${stillMissing.join(', ')}`);
  }
  return parsed;
}

(async () => {
  const output = [];
  for (let index = startBatch - 1; index < endBatch && index < batches.length; index++) {
    const parsed = await processBatch(batches[index], index);
    for (let number = 1; number <= batches[index].length; number++) {
      for (const line of parsed.get(number)) output.push(line);
    }
    output.push('');
    fs.writeFileSync(outputPath, output.join('\n'), 'utf8');
    console.error(`Processed batch ${index + 1}/${batches.length}`);
  }
  fs.writeFileSync(outputPath, output.join('\n'), 'utf8');
  console.error(`Done: ${outputPath}`);
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
