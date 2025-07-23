document.addEventListener('DOMContentLoaded', () => {
    // --- DOM & D3 Setup ---
    const container = d3.select('#mindmap-container');
    const { width, height } = container.node().getBoundingClientRect();
    const svg = container.append('svg').attr('class', 'mindmap-svg');
    const g = svg.append('g'); // Group for zooming/panning

    // --- State Management ---
    let nodes = [];
    let links = [];
    let nodeIdCounter = 0;
    let selectedNodeId = null;

    // --- D3 Behaviors ---
    const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);
    const drag = d3.drag()
        .on('start', (e, d) => d3.select(e.sourceEvent.target.closest('.node')).raise())
        .on('drag', (e, d) => { d.x = e.x; d.y = e.y; update(); });

    // --- Core Rendering Function ---
    function update() {
        // Links
        g.selectAll('.link').data(links, d => `${d.source.id}-${d.target.id}`).join(
            enter => enter.append('path').attr('class', 'link'),
            update => update,
            exit => exit.remove()
        ).attr('d', d => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`);

        // Nodes
        const node = g.selectAll('.node').data(nodes, d => d.id);
        node.exit().remove();
        
        const nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .call(drag)
            .on('click', (e, d) => { selectedNodeId = d.id; update(); e.stopPropagation(); })
            .on('dblclick', (e, d) => editText(d, e.currentTarget));

        nodeEnter.append('rect').attr('rx', 10);
        nodeEnter.append('text').attr('dy', '0.35em');

        const allNodes = node.merge(nodeEnter)
            .attr('transform', d => `translate(${d.x},${d.y})`)
            .classed('selected', d => d.id === selectedNodeId);

            // This is the NEW, corrected code
    allNodes.select('text')
        .text(d => d.text)
        .each(function(d) {
            // Measure the rendered text
            const bbox = this.getBBox();
            const padding = 25; // Add some horizontal padding
            // Update the node's width in the data
            d.width = bbox.width + padding;
        });

    allNodes.select('rect')
        .attr('width', d => d.width)
        .attr('height', d => d.height)
        .attr('x', d => -d.width / 2)
        .attr('y', d => -d.height / 2);
    }

    // --- Interaction Handlers ---
    svg.on('click', () => { selectedNodeId = null; update(); });

    function editText(d, element) {
        const textEl = d3.select(element).select('text').style('display', 'none');
        d3.select(element).append('foreignObject')
            .attr('x', -d.width / 2).attr('y', -d.height / 2)
            .attr('width', d.width).attr('height', d.height)
            .append('xhtml:input')
            .attr('class', 'node-text-editor')
            .attr('value', d.text)
            .on('blur', function() {
                d.text = this.value;
                d3.select(this.parentNode).remove();
                textEl.style('display', null);
                update();
            }).on('keydown', function(e) { if (e.key === 'Enter') this.blur(); })
            .node().focus();
    }

    // --- Backend API Call ---
    async function generateMindMap() {
        const topic = document.getElementById('topic-input').value.trim();
        if (!topic) { alert('Please enter a central topic.'); return; }

        document.getElementById('loader').classList.remove('hidden');
        
        try {
            const response = await fetch('/api/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            // Reset and build new map
            nodes = [];
            links = [];
            nodeIdCounter = 0;
            const { width: vw, height: vh } = container.node().getBoundingClientRect();

            const centralNode = { id: ++nodeIdCounter, text: topic, x: vw / 2, y: vh / 2, width: 150, height: 50, isCentral: true };
            nodes.push(centralNode);

            const radius = 250;
            const angleStep = (2 * Math.PI) / data.suggestions.length;
            data.suggestions.forEach((suggestion, i) => {
                const angle = i * angleStep;
                const childNode = {
                    id: ++nodeIdCounter,
                    text: suggestion,
                    x: centralNode.x + radius * Math.cos(angle),
                    y: centralNode.y + radius * Math.sin(angle),
                    width: 140,
                    height: 40
                };
                nodes.push(childNode);
                links.push({ source: centralNode, target: childNode });
            });
            
            resetView();

        } catch (error) {
            console.error('Failed to generate mind map:', error);
            alert('Could not generate suggestions. Please try again.');
        } finally {
            document.getElementById('loader').classList.add('hidden');
        }
    }
    
    function resetView() {
        const { width: vw, height: vh } = container.node().getBoundingClientRect();
        const centralNode = nodes.find(n => n.isCentral);
        const focusX = centralNode ? centralNode.x : vw / 2;
        const focusY = centralNode ? centralNode.y : vh / 2;
        
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(vw / 2 - focusX, vh / 2 - focusY)
        );
        update();
    }


    // --- Node Manipulation ---
    function addNode() {
        const parent = nodes.find(n => n.id === selectedNodeId);
        if (!parent) { alert("Please select a parent node first."); return; }
        const newNode = { id: ++nodeIdCounter, text: "New Node", x: parent.x + 100, y: parent.y + 100, width: 120, height: 40 };
        nodes.push(newNode);
        links.push({ source: parent, target: newNode });
        update();
    }

    function deleteNode() {
        if (selectedNodeId === null) { alert("Please select a node to delete."); return; }
        const toDelete = new Set([selectedNodeId]);
        let changed = true;
        while(changed) {
            changed = false;
            links.forEach(l => {
                if (toDelete.has(l.source.id) && !toDelete.has(l.target.id)) { toDelete.add(l.target.id); changed = true; }
            });
        }
        nodes = nodes.filter(n => !toDelete.has(n.id));
        links = links.filter(l => !toDelete.has(l.source.id) && !toDelete.has(l.target.id));
        selectedNodeId = null;
        update();
    }

    // --- File Operations ---
    function saveToJson() {
        // Use node IDs instead of full objects for serialization
        const serializableLinks = links.map(l => ({ source: l.source.id, target: l.target.id }));
        const data = JSON.stringify({ nodes, links: serializableLinks, nodeIdCounter }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'mindmap.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function loadFromJson(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const data = JSON.parse(e.target.result);
            nodes = data.nodes;
            // Reconstruct link objects from IDs
            links = data.links.map(l => ({
                source: nodes.find(n => n.id === l.source),
                target: nodes.find(n => n.id === l.target)
            }));
            nodeIdCounter = data.nodeIdCounter;
            selectedNodeId = null;
            resetView();
        };
        reader.readAsText(file);
        event.target.value = null; // Allow re-loading the same file
    }

    async function exportImage(format) {
        // Inlining styles for export
        const style = document.createElement('style');
        document.head.appendChild(style);
        for (const sheet of document.styleSheets) {
            try {
                if(sheet.cssRules) style.sheet.insertRule(Array.from(sheet.cssRules).map(r => r.cssText).join('\n'));
            } catch (e) { console.warn("Cannot read cross-origin stylesheet"); }
        }
        const svgString = new XMLSerializer().serializeToString(svg.node());
        document.head.removeChild(style);

        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        if (format === 'svg') {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mindmap.svg';
            a.click();
            URL.revokeObjectURL(url);
        } else { // PNG
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = svg.node().getBoundingClientRect().width;
                canvas.height = svg.node().getBoundingClientRect().height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                const pngUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = pngUrl;
                a.download = 'mindmap.png';
                a.click();
            };
            img.src = url;
        }
    }

    // --- Event Listeners ---
    document.getElementById('generate-btn').addEventListener('click', generateMindMap);
    document.getElementById('add-node-btn').addEventListener('click', addNode);
    document.getElementById('delete-node-btn').addEventListener('click', deleteNode);
    document.getElementById('save-json-btn').addEventListener('click', saveToJson);
    document.getElementById('load-json-input').addEventListener('change', loadFromJson);
    document.getElementById('export-png-btn').addEventListener('click', () => exportImage('png'));
    document.getElementById('export-svg-btn').addEventListener('click', () => exportImage('svg'));

    // --- Initial State ---
    update();
});