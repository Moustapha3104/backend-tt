const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'src', 'controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));

function refactorContent(content) {
  // Convert exports.func = (req, res) to exports.func = async (req, res)
  content = content.replace(/exports\.(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>\s*\{/g, (match, p1, p2, p3) => {
    if (!p2) return `exports.${p1} = async (${p3}) => {`;
    return match;
  });

  // Replace get
  content = content.replace(/db\.prepare\(([`'])(.*?)([`'])\)\.get\(([^)]*)\)/g, "((await db.query($1$2$3, [$4]))[0][0])");
  content = content.replace(/db\.prepare\(([`'])(.*?)([`'])\)\.get\(\)/g, "((await db.query($1$2$3))[0][0])");
  
  // Replace all
  content = content.replace(/db\.prepare\(([`'])(.*?)([`'])\)\.all\(([^)]*)\)/g, "((await db.query($1$2$3, [$4]))[0])");
  content = content.replace(/db\.prepare\(([`'])(.*?)([`'])\)\.all\(\)/g, "((await db.query($1$2$3))[0])");

  // Replace run
  content = content.replace(/db\.prepare\(([`'])(.*?)([`'])\)\.run\(([^)]*)\)/g, "((await db.query($1$2$3, [$4]))[0])");
  content = content.replace(/db\.prepare\(([`'])(.*?)([`'])\)\.run\(\)/g, "((await db.query($1$2$3))[0])");

  // Replace lastInsertRowid
  content = content.replace(/lastInsertRowid/g, 'insertId');

  return content;
}

for (const file of files) {
  let content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
  let newContent = refactorContent(content);
  fs.writeFileSync(path.join(controllersDir, file), newContent);
  console.log(`Refactored ${file}`);
}

// Do the same for utils and jobs
const utilsDir = path.join(__dirname, 'src', 'utils');
if (fs.existsSync(utilsDir)) {
    for(const file of fs.readdirSync(utilsDir)) {
        if(file.endsWith('.js')) {
            let content = fs.readFileSync(path.join(utilsDir, file), 'utf8');
            let newContent = refactorContent(content);
            fs.writeFileSync(path.join(utilsDir, file), newContent);
            console.log(`Refactored ${file}`);
        }
    }
}

const jobsDir = path.join(__dirname, 'src', 'jobs');
if (fs.existsSync(jobsDir)) {
    for(const file of fs.readdirSync(jobsDir)) {
        if(file.endsWith('.js')) {
            let content = fs.readFileSync(path.join(jobsDir, file), 'utf8');
            let newContent = refactorContent(content);
            fs.writeFileSync(path.join(jobsDir, file), newContent);
            console.log(`Refactored ${file}`);
        }
    }
}
