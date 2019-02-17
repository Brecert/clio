const fs = require('fs');
const path = require('path');
const lexer = require('../lexer/lexer');
const parser = require('../parser/parser');
const analyzer = require('../evaluator/analyzer');
const builtins = require('./builtins');
const beautify = require('js-beautify').js;

function write_file(source, path) {
  fs.writeFileSync(path, source);
}

async function clio_require(module_name, names_to_import, current_dir, scope) {
  // TODO: must work in browser (http imports)
  // TODO: must work for built-in modules
  current_dir = current_dir.replace(/\.clio-cache$/,'');
  if (module_name.endsWith('.js')) {
    var mod = require(path.join(current_dir, module_name));
    if (names_to_import.length == 0) {
      // import all
      var clio_module = {};
      module_name = module_name.replace(/.js$/, '').replace(/.*?\/+/, '');
      clio_module[module_name] = mod;
    } else {
      var clio_module = {};
      names_to_import.forEach(function (name) {
        clio_module[name] = mod[name];
      })
    }
  } else if (module_name.indexOf('/') > -1) {
    if (!module_name.endsWith('.clio')) {
      module_name = `${module_name}.clio`
    }
    module_path = path.join(current_dir, module_name);
    if (fs.existsSync(module_path)) {
      var mod = await clio_import(module_path);
      if (names_to_import.length == 0) {
        // import all
        var clio_module = {};
        module_name = module_name.replace(/.clio/, '').replace(/.*?\/+/, '');
        clio_module[module_name] = mod;
      } else {
        var clio_module = {};
        names_to_import.forEach(function (name) {
          clio_module[name] = mod[name];
        })
      }
    }
  } else if (module_name.endsWith('.clio')) {
    module_path = path.join(current_dir, module_name);
    if (fs.existsSync(module_path)) {
      var mod = await clio_import(module_path);
      if (names_to_import.length == 0) {
        // import all
        var clio_module = {};
        module_name = module_name.replace(/.clio/, '').replace(/.*?\/+/, '');
        clio_module[module_name] = mod;
      } else {
        var clio_module = {};
        names_to_import.forEach(function (name) {
          clio_module[name] = mod[name];
        })
      }
    }
  } else {
    module_path = path.join(current_dir, `${module_name}.clio`);
    if (fs.existsSync(module_path)) {
      var mod = await clio_import(module_path);
      if (names_to_import.length == 0) {
        // import all
        var clio_module = {};
        clio_module[module_name] = mod;
      } else {
        var clio_module = {};
        names_to_import.forEach(function (name) {
          clio_module[name] = mod[name];
        })
      }
    }
  }
  Object.assign(scope, clio_module);
}

builtins.clio_require = clio_require;

function do_import(file, direct) {
  var contents = fs.readFileSync(file, 'utf8');
  var tokens = lexer(contents);
  if (tokens[0] == false) {
    return;
  }
  tokens = tokens[1];
  try {
    var result = parser(contents, tokens, false, file);
  } catch (e) {
    throw e;
  }
  var ast = result[1];
  ast.pop() // eof
  var code = beautify(analyzer(ast, contents));

  if (!path.isAbsolute(file)) {
    var cwd = process.cwd();
    var file = path.join(cwd, file);
  }
  var file_dir = path.dirname(file);
  var file_name = path.basename(file);
  var cache_dir = `${file_dir}${path.sep}.clio-cache`
  var cache_file = `${cache_dir}${path.sep}${file_name}.js`;
  if (!fs.existsSync(cache_dir)){
    fs.mkdirSync(cache_dir);
  }

  write_file(code, cache_file);
  cache_file = cache_file.replace(/\\/g, '/'); // windows fix |:
  return require(cache_file)({}, builtins, {source: contents, name: file_name}).catch(e => {throw e});  // because why not?
}

function clio_import(file, direct) {
  if (!path.isAbsolute(file)) {
    var cwd = process.cwd();
    file = path.join(cwd, file);
  }
  var file_dir = path.dirname(file);
  if (direct) {
    global.__basedir = file_dir;
    process.chdir(file_dir);
  }
  var file_name = path.basename(file);
  var cache_dir = `${file_dir}${path.sep}.clio-cache`
  var cache_file = `${cache_dir}${path.sep}${file_name}.js`;
  if (!fs.existsSync(cache_dir)){
    fs.mkdirSync(cache_dir);
  }
  if (fs.existsSync(cache_file)) {
    var cache_stats = fs.statSync(cache_file);
    var source_stats = fs.statSync(file);
    if (cache_stats.mtime > source_stats.mtime) {
      cache_file = cache_file.replace(/\\/g, '/'); // windows fix |:
      var contents = fs.readFileSync(file, 'utf8');
      return require(cache_file)({}, builtins, {source: contents, name: file_name}).catch(e => {throw e});
    }
  }
  try {
    return do_import(file);
  } catch (e) {
    throw e;
  }
}

module.exports = clio_import;
