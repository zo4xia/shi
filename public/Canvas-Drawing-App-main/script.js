let x0 = 0, y0 = 0, mx = 0, my = 0, deseneaza = false;
let canvas, context, fundal = "white";
let figuri = [], instrument = "ellipse";
let W, H;

function deseneazaFigurile() {
    for (let figura of figuri) {
        context.strokeStyle = figura.culoareLinie;
        context.lineWidth = figura.grosimeLinie;

        if (figura.type === "ellipse") {
            let centerX, centerY, radiusX, radiusY;
            centerX = (figura.x0 + figura.mx) / 2;
            centerY = (figura.y0 + figura.my) / 2;
            radiusX = Math.abs((figura.mx - figura.x0) / 2);
            radiusY = Math.abs((figura.my - figura.y0) / 2);
            context.beginPath();
            context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
            context.stroke();
        }

        if (figura.type === "rectangle") {
            let width = Math.abs(figura.mx - figura.x0);
            let height = Math.abs(figura.my - figura.y0);
            let startX = Math.min(figura.x0, figura.mx);
            let startY = Math.min(figura.y0, figura.my);
            context.beginPath();
            context.rect(startX, startY, width, height);
            context.stroke();
        }

        if (figura.type === "line") {
            context.beginPath();
            context.moveTo(figura.x0, figura.y0);
            context.lineTo(figura.mx, figura.my);
            context.stroke();
        }
    }
}

function mousedown(e) {
    deseneaza = true;
    x0 = e.clientX - canvas.getBoundingClientRect().x;
    y0 = e.clientY - canvas.getBoundingClientRect().y;
}

function mouseup(e) {
    if (!deseneaza) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    mx = e.clientX - canvas.getBoundingClientRect().x;
    my = e.clientY - canvas.getBoundingClientRect().y;
    deseneaza = false;

    figuri.push({ type: instrument, culoareLinie: context.strokeStyle, grosimeLinie: context.lineWidth, x0: x0, y0: y0, mx: mx, my: my });

    coloreazaCanvas();
    deseneazaFigurile();

    context.strokeStyle = document.getElementById("lineColor").value;
    context.lineWidth = document.getElementById("lineSize").value;
}

function mousemove(e) {
    if (!deseneaza) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    mx = e.clientX - canvas.getBoundingClientRect().x;
    my = e.clientY - canvas.getBoundingClientRect().y;

    coloreazaCanvas();

    deseneazaFigurile();

    context.strokeStyle = document.getElementById("lineColor").value;
    context.lineWidth = document.getElementById("lineSize").value;

    if (instrument === "ellipse") {
        let cx = (x0 + mx) / 2;
        let cy = (y0 + my) / 2;
        let rx = Math.abs(x0 - mx) / 2;
        let ry = Math.abs(y0 - my) / 2;

        context.beginPath();
        context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        context.stroke();
    }

    if (instrument === "rectangle") {
        let width = Math.abs(mx - x0);
        let height = Math.abs(my - y0);
        let startX = Math.min(x0, mx);
        let startY = Math.min(y0, my);
        context.beginPath();
        context.rect(startX, startY, width, height);
        context.stroke();
    }

    if (instrument === "line") {
        context.beginPath();
        context.moveTo(x0, y0);
        context.lineTo(mx, my);
        context.stroke();
    }
}

function coloreazaCanvas() {
    context.fillStyle = fundal;
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function aplicatie() {
    canvas = document.querySelector("canvas");
    context = canvas.getContext("2d");
    H = canvas.height;
    W = canvas.width;

    coloreazaCanvas();

    canvas.addEventListener("mousedown", mousedown);
    canvas.addEventListener("mousemove", mousemove);
    canvas.addEventListener("mouseup", mouseup);

    document.querySelector(".ellipse").addEventListener("click", () => {
        instrument = "ellipse";
    });

    document.querySelector(".line").addEventListener("click", () => {
        instrument = "line";
    });

    document.querySelector(".rectangle").addEventListener("click", () => {
        instrument = "rectangle";
    });

    document.getElementById("bgColor").addEventListener("input", function (e) {
        fundal = e.target.value;

        coloreazaCanvas();

        deseneazaFigurile();
    });

    document.getElementById("lineColor").addEventListener("input", function (e) {
        context.strokeStyle = e.target.value;
    });

    document.getElementById("lineSize").addEventListener("input", function (e) {
        context.lineWidth = e.target.value;
    });

    document.getElementById("exportRaster").addEventListener("click", function () {
        const url = canvas.toDataURL('image/png', 0.9);
        const link = document.createElement('a');
        link.download = 'desen.png';
        link.href = url;
        link.click();
    });

    document.getElementById("exportSVG").addEventListener("click", function () {
        let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

        svg = svg + `<rect width="100%" height="100%" fill="${fundal}" />`;

        for (let figura of figuri) {
            const culoareLinie = figura.culoareLinie;
            const grosimeLinie = figura.grosimeLinie;
            if (figura.type === "ellipse") {
                let cx = (figura.x0 + figura.mx) / 2;
                let cy = (figura.y0 + figura.my) / 2;
                let rx = Math.abs((figura.mx - figura.x0) / 2);
                let ry = Math.abs((figura.my - figura.y0) / 2);
                svg += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${figura.culoareLinie}" stroke-width="${figura.grosimeLinie}" fill="none" />`;
            }
            if (figura.type === "rectangle") {
                let width = Math.abs(figura.mx - figura.x0);
                let height = Math.abs(figura.my - figura.y0);
                let startX = Math.min(figura.x0, figura.mx);
                let startY = Math.min(figura.y0, figura.my);
                svg += `<rect x="${startX}" y="${startY}" width="${width}" height="${height}" stroke="${culoareLinie}" stroke-width="${grosimeLinie}" fill="none" />`;
            }
            if (figura.type === "line") {
                svg += `<line x1="${figura.x0}" y1="${figura.y0}" x2="${figura.mx}" y2="${figura.my}" stroke="${culoareLinie}" stroke-width="${grosimeLinie}" />`;
            }
        }

        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg + '</svg>');
        const link = document.createElement('a');
        link.download = 'desen.svg';
        link.href = url;
        link.click();
    });
}

document.addEventListener("DOMContentLoaded", aplicatie);