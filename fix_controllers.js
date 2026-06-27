const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'src', 'controllers');

for (const file of fs.readdirSync(controllersDir)) {
  if (!file.endsWith('.js')) continue;
  let content = fs.readFileSync(path.join(controllersDir, file), 'utf8');

  // Fix await await
  content = content.replace(/await await/g, 'await');

  // Fix db.prepare(...).all(...) that spans lines
  // A regex won't be perfect. Let's do it manually via a while loop.
  let oldContent;
  do {
    oldContent = content;
    // MATCH: db.prepare( <query> ).all( <args> ) or .run( <args> )
    // Because JS regex doesn't support recursive balancing, we use a simple approach for known patterns in this codebase.
    content = content.replace(/db\.prepare\(([^)]*)\)\.all\(([^)]*)\)/g, "((await db.query($1, [$2]))[0])");
    content = content.replace(/db\.prepare\(([^)]*)\)\.get\(([^)]*)\)/g, "((await db.query($1, [$2]))[0][0])");
    content = content.replace(/db\.prepare\(([^)]*)\)\.run\(([^)]*)\)/g, "((await db.query($1, [$2]))[0])");
  } while (content !== oldContent);

  // Fix multiline `db.prepare('...').run(...)` where `.run` is on next line
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\s*\.run\(([\s\S]*?)\)/g, "((await db.query($1, [$2]))[0])");
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\s*\.get\(([\s\S]*?)\)/g, "((await db.query($1, [$2]))[0][0])");
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\s*\.all\(([\s\S]*?)\)/g, "((await db.query($1, [$2]))[0])");
  
  // Also handle .all(), .get(), .run() without args
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\s*\.run\(\)/g, "((await db.query($1))[0])");
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\s*\.get\(\)/g, "((await db.query($1))[0][0])");
  content = content.replace(/db\.prepare\(([\s\S]*?)\)\s*\.all\(\)/g, "((await db.query($1))[0])");

  // Fix "const hasColumn = (table, column) => {" to "const hasColumn = async (table, column) => {"
  content = content.replace(/const hasColumn = \(table, column\) => \{/g, 'const hasColumn = async (table, column) => {');
  
  fs.writeFileSync(path.join(controllersDir, file), content);
}

// Fix server.js to use await db.query instead of db.exec
// Actually server.js doesn't use db.prepare, but schema.js does
