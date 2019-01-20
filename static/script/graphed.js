import {api} from '/static/script/api.js';

var canvas;
var ctx;
var overlay;
var nodes = [];
var z = 1;
var offset = [ 0, 0 ];
var origin = [ 0, 0 ];
var active;
var grabbed = false;
var connecting = false;
var firstConnected = undefined;

function Node(id, name) {
  this.id = id;
  this.x = canvas.width / 2;
  this.y = canvas.height / 2;
  this.Fx = 0;
  this.Fy = 0;
  this.neighbours = [];
  this.previousContent = "";
  this.previousName = name;

  this.div = document.createElement('div');
  var title = document.createElement('div');
  title.classList.add('title');
  var heading = document.createElement('input');
  heading.setAttribute('type', 'text');
  heading.classList.add('name');
  heading.setAttribute('placeholder', 'Empty note');
  heading.value = name;
  title.appendChild(heading);
  var controls = document.createElement('div');
  controls.classList.add('controls');
  var shrink = document.createElement('div');
  shrink.classList.add('shrink');
  shrink.classList.add('button');
  shrink.innerHTML = '<span class="mdi mdi-arrow-collapse"></span>';
  shrink.addEventListener('click', () => { this.shrink(); });
  var content = document.createElement('div');
  content.classList.add('internal');
  var plus = document.createElement('a');
  plus.classList.add('plus');
  plus.classList.add('button');
  plus.innerHTML = '<span class="mdi mdi-plus"></span>';
  plus.addEventListener('click', e => {
    api.createNote(active, "", note => {
      api.connectNotes(active, this.id, note.id, connection => {
        if (!connecting) {
          // TODO save ID
          var node = new Node(note.id, note.name);
          node.setPosition(e.clientX, e.clientY);
          this.addNeighbour(node);
          node.expand();
          addNode(node);
        }
      });
    });
  });
  var bin = document.createElement('a');
  bin.classList.add('delete');
  bin.classList.add('button');
  bin.innerHTML = '<span class="mdi mdi-delete"></span>';
  bin.addEventListener('click', e => {
    if (!connecting) {
      if (nodes.length > 1) {
        api.removeNote(active, this.id, () => {
          overlay.removeChild(this.div);
          nodes.splice(nodes.indexOf(this), 1);
          for (var node of nodes) {
            if (node.neighbours.includes(this))
              node.neighbours.splice(node.neighbours.indexOf(this), 1);
          }
        });
      }
    }
  });
  controls.appendChild(bin);
  controls.appendChild(plus);
  controls.appendChild(shrink);
  title.appendChild(controls);
  var body = document.createElement('textarea');
  body.setAttribute('placeholder', 'Add some text');
  api.getNote(active, id, content => {
    body.value = content;
    this.previousContent = content;
    setInterval(() => {
      if (body.value != this.previousContent) {
        this.previousContent = body.value;
        api.updateNote(active, id, body.value, () => {});
      }
      if (heading.value != this.previousName) {
        this.previousName = heading.value
        api.renameNote(active, id, heading.value, () => {});
      }
    }, 1000);
  });
  content.appendChild(body);
  this.div.appendChild(title);
  this.div.appendChild(content);
  this.div.classList.add('note');
  overlay.appendChild(this.div);

  this.expanded = false;
  this.selected = false;

  this.expand = function() {
    if (!this.expanded) {
      this.expanded = true;
      this.div.classList.add('expanded');
    }
    this.div.style["z-index"] = z;
    z += 1;
  };

  this.shrink = function() {
    if (this.expanded) {
      this.div.querySelector('.name').setSelectionRange(0, 0);
      this.div.querySelector('.name').blur();
      this.div.querySelector('textarea').blur();
      this.div.classList.remove('expanded');
      this.expanded = false;
    }
    this.div.style["z-index"] = 0;
  };

  this.renderEdges = function(ctx) {
    for (var neighbour of this.neighbours) {
      if (this.expanded || neighbour.expanded) {
        ctx.strokeStyle = "#31a9f3";
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = "#CCC";
        ctx.lineWidth = 3;
      }
      ctx.beginPath();
      ctx.moveTo(-origin[0] + this.x, -origin[1] + this.y);
      ctx.lineTo(-origin[0] + neighbour.x, -origin[1] + neighbour.y);
      ctx.stroke();
    }
  };

  this.update = function() {
    if (!this.expanded)
      this.setPosition(this.x + this.Fx, this.y + this.Fy);
    else
      this.setPosition(this.x, this.y);
  };

  this.addNeighbour = function(node) {
    if (!this.neighbours.includes(node))
      this.neighbours.push(node);
  };

  this.setPosition = function(x, y) {
    this.x = x;
    this.y = y;
    this.div.style.left =
        (-origin[0] + this.x - this.div.offsetWidth / 2) + "px";
    this.div.style.top =
        (-origin[1] + this.y - this.div.offsetHeight / 2) + "px";
  };

  this.contains = function(x, y) {
    var rect = this.div.getBoundingClientRect();
    var subrect = this.div.querySelector('.internal').getBoundingClientRect();
    return (x > rect.left && x < rect.left + rect.width && y > rect.top &&
            y < rect.top + rect.height);
  };

  this.intersects = function(node) {
    var rect = this.div.getBoundingClientRect();
    var other = node.div.getBoundingClientRect();
    return !(rect.left + rect.width + 50 < other.left ||
             other.left + other.width + 50 < rect.left ||
             rect.top + rect.height + 50 < other.top ||
             other.top + other.height + 50 < rect.top);
  };

  this.setPosition(this.x, this.y);
}

function distance(x1, x2, y1, y2) {
  return (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
}

function nDistance(node1, node2) {
  return distance(node1.x, node2.x, node1.y, node2.y);
}

function update() {
  var overlayRect = overlay.getBoundingClientRect();
  canvas.width = overlayRect.width;
  canvas.height = overlayRect.height;

  for (var node of nodes) {
    var frepx = 0;
    var frepy = 0;
    var fspringx = 0;
    var fspringy = 0;

    for (var other of nodes) {
      if (node !== other) {
        if (node.neighbours.includes(other) ||
            other.neighbours.includes(node)) {
          var temp = nDistance(other, node);
          if (!other.expanded) {
            fspringx += 0.005 * Math.log(temp) * (other.x - node.x);
            fspringy += 0.005 * Math.log(temp) * (other.y - node.y);
          } else {
            fspringx += 0.00075 * Math.log(temp) * (other.x - node.x);
            fspringy += 0.00075 * Math.log(temp) * (other.y - node.y);
          }
        }
        frepx += 400 / nDistance(other, node) * (node.x - other.x);
        frepy += 400 / nDistance(other, node) * (node.y - other.y);
      }
    }

    node.Fx = frepx + fspringx;
    node.Fy = frepy + fspringy;
  }

  for (var node of nodes) {
    if (!node.selected)
      node.update();
  }

  render();
  window.requestAnimationFrame(update);
}

function render() {
  ctx.fillStyle = "#FCFCFC";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (var node of nodes)
    node.renderEdges(ctx);
}

function addNode(node) { nodes.push(node); }

function getMousePos(target, e) {
  var rect = target.getBoundingClientRect();
  return {x : e.clientX - rect.left, y : e.clientY - rect.top};
}

function enterWorkspace(workspace, name) {
  if (workspace !== active) {
    active = workspace;
    document.getElementById("workspace_name").innerHTML = name;
    api.getWorkspace(active, function(notes, connections) {
      for (var node of nodes)
        overlay.removeChild(node.div);
      nodes = [];
      for (var note of notes) {
        var node = new Node(note.id, note.name);
        node.setPosition(node.x + Math.random() * 50 - 25,
                         node.y + Math.random() * 50 - 25);
        addNode(node);
      }
      for (var connection of connections) {
        for (var node of nodes) {
          if (node.id === connection.origin) {
            for (var other of nodes) {
              if (node !== other && other.id === connection.target) {
                node.addNeighbour(other);
                break;
              }
            }
            break;
          }
        }
      }
    });
  }
}

function addWorkspace(id, name) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(name));
  div.addEventListener('click', function() { enterWorkspace(id, name); });
  document.getElementById('workspaces').appendChild(div);
}

$(document).ready(function() {
  overlay = document.getElementById('overlay');
  canvas = document.getElementById('graph');
  ctx = canvas.getContext('2d');
  update();

  $('#enter_connection_mode').on('click', () => {
    connecting = true;
    overlay.classList.add('connecting');
  });

  overlay.addEventListener('mousemove', function(e) {
    var mousePos = getMousePos(overlay, e);
    for (var node of nodes) {
      if (node.selected) {
        node.setPosition(mousePos.x - offset[0], mousePos.y - offset[1]);
        return;
      }
    }
    if (grabbed) {
      origin = [ -e.clientX + offset[0], -e.clientY + offset[1] ];
    }
  }, false);

  overlay.addEventListener('mousedown', function(e) {
    if (!connecting) {
      grabbed = true;
      var mousePos = getMousePos(overlay, e);
      for (var node of nodes) {
        node.selected = false;
      }
      for (var node of nodes) {
        if (node.contains(mousePos.x, mousePos.y)) {
          offset = [ mousePos.x - node.x, mousePos.y - node.y ];
          node.selected = true;
          node.expand();
          return;
        }
        offset = [ origin[0] + e.clientX, origin[1] + e.clientY ];
      }
    } else {
      var mousePos = getMousePos(overlay, e);
      for (var node of nodes) {
        if (node.contains(mousePos.x, mousePos.y)) {
          if (firstConnected == undefined) {
            firstConnected = node;
            node.div.classList.add('highlight');
            break;
          } else {
            var other = firstConnected;
            api.connectNotes(
                active, node.id, firstConnected.id,
                function(connection) { other.addNeighbour(node); });
            connecting = false;
            firstConnected.div.classList.remove('highlight');
            firstConnected = undefined;
            overlay.classList.remove('connecting');
            break;
          }
        }
      }
    }
  });

  overlay.addEventListener('mouseup', function(e) {
    for (var node of nodes) {
      node.selected = false;
    }
    grabbed = false;
  });

  document.getElementById('add_workspace').addEventListener('click', () => {
    var value = document.getElementById('new_workspace_name').value;
    if (value !== "") {
      api.createWorkspace(
          value, id => {api.createNote(id, "", note => {
                   addWorkspace(id, value);
                   document.getElementById('new_workspace_name').value = "";
                 })});
    }
  });

  api.getWorkspaces(function(workspaces) {
    for (var workspace of workspaces) {
      addWorkspace(workspace.id, workspace.name);
    }
    if (workspaces.length > 0) {
      enterWorkspace(workspaces[0].id, workspaces[0].name);
    }
  });
});
