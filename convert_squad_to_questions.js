// convert_squad_to_questions.js
// Strict converter: extracts SQuAD QA pairs and keeps only CS items (Algorithms / Data Structures / Databases)
// Run: node convert_squad_to_questions.js

const fs = require('fs');
const path = require('path');

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function isShortAnswer(answer, maxWords = 5) {
  if (!answer) return false;
  const w = normalizeWhitespace(answer).split(' ').filter(Boolean);
  return w.length <= maxWords;
}

function normalizeText(s) {
  return (s || '').toString().toLowerCase().replace(/[^\w\s]/g, ' ');
}

// Strict classifier used both in converter and server
function classifySquadTopic(title, question, answer) {
  const t = (title || "").toLowerCase();
  const q = (question || "").toLowerCase();
  const a = (answer || "").toLowerCase();
  const combined = `${t} ${q} ${a}`;

  const negative = [
    "capital","country","president","currency","film","movie","actor","singer",
    "football","cricket","olympic","season","what year","born","birthday",
    "chemical","element","planet","city","state","province"
  ];
  if (negative.some(ng => combined.includes(ng))) return null;

  const algoKeywords = [
    "binary search","merge sort","quick sort","heap sort","time complexity",
    "dynamic programming","greedy algorithm","search algorithm",
    "algorithm","big o","o(","recursion","dijkstra","bfs","dfs","kruskal","prim"
  ];

  const dsKeywords = [
    "binary search tree","binary tree","linked list","hash table","priority queue",
    "stack","queue","graph","heap","array","trie","adjacency","node","edge","bst"
  ];

  const dbKeywords = [
    "primary key","foreign key","inner join","left join","right join","cross join",
    "normalization","transaction","commit","rollback","sql query","database","schema","index"
  ];

  function countMatches(list) {
    let count = 0;
    for (const tok of list) if (combined.includes(tok)) count++;
    return count;
  }

  function hasStrongPhrase(list) {
    return list.some(tok => tok.includes(' ') && combined.includes(tok));
  }

  const algoCount = countMatches(algoKeywords);
  const dsCount = countMatches(dsKeywords);
  const dbCount = countMatches(dbKeywords);

  if (algoCount >= 2 || hasStrongPhrase(algoKeywords)) return 'Algorithms';
  if (dsCount >= 2 || hasStrongPhrase(dsKeywords)) return 'Data Structures';
  if (dbCount >= 2 || hasStrongPhrase(dbKeywords)) return 'Databases';
  return null;
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadSQuAD(file) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) return [];
  const j = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const items = [];
  let idCounter = 0;
  for (const p of j.data) {
    for (const para of p.paragraphs) {
      for (const qa of para.qas) {
        const question = qa.question;
        const answers = qa.answers || [];
        const chosen = answers.find(a => isShortAnswer(a.text, 5));
        if (!chosen) continue;
        const shortAns = normalizeWhitespace(chosen.text);
        // classify using title+question+answer strictly
        const topic = classifySquadTopic(p.title || '', question, shortAns);
        if (!topic) continue;
        idCounter++;
        const lowerAns = shortAns.toLowerCase().replace(/[^\w\s]/g,'');
        const kws = lowerAns.split(/\s+/).filter(Boolean).slice(0,5);
        items.push({
          id: `squad_${Date.now()}_${idCounter}`,
          topic: topic,
          concept: topic,
          type: 'short',
          question: question,
          answer: shortAns,
          keywords: kws
        });
      }
    }
  }
  return items;
}

function main() {
  const trainFile = 'train-v1.1.json';
  const devFile = 'dev-v1.1.json';
  let all = [];
  if (fs.existsSync(path.join(__dirname, trainFile))) {
    all = all.concat(loadSQuAD(trainFile));
  }
  if (fs.existsSync(path.join(__dirname, devFile))) {
    all = all.concat(loadSQuAD(devFile));
  }
  console.log('SQuAD CS short-answer items extracted:', all.length);
  const outPath = path.join(__dirname, 'squad_cs_short_questions.json');
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), 'utf8');
  console.log('Wrote', outPath);
}

main();