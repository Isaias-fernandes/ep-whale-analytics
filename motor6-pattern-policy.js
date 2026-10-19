/* Motor 6 policy derived from EP Laboratorio H1 experiments. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EPMotor6PatternPolicy = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const VOLUME_MIN = 1.2;
  const SELL_WEIGHT_FACTOR = 0.45;
  const RULES = Object.freeze({
    "Three Rising Valleys": { rank: 1, weight: 26, candidateWeight: 26, confirmation: "breakout" },
    "Bull Pennant": { rank: 2, weight: 24, candidateWeight: 13, confirmation: "volume-obv" },
    "Bull Flag": { rank: 3, weight: 22, candidateWeight: 12, confirmation: "volume-obv" },
    "Rectangle Accumulation": { rank: 4, weight: 16, candidateWeight: 8, confirmation: "breakout" },
    "Rectangle / Trading Range": { rank: 4, weight: 16, candidateWeight: 8, confirmation: "breakout" },
    "Double Bottom": { rank: 5, weight: 14, candidateWeight: 7, confirmation: "breakout" },
    "Falling Wedge": { rank: 6, weight: 14, candidateWeight: 7, confirmation: "volume-obv" },
    "Bear Pennant": { rank: 20, weight: 12, candidateWeight: 5, confirmation: "breakdown" },
    "Bear Flag": { rank: 21, weight: 11, candidateWeight: 5, confirmation: "breakdown" },
    "Rectangle Distribution": { rank: 22, weight: 9, candidateWeight: 4, confirmation: "breakdown" },
    "Double Top": { rank: 23, weight: 9, candidateWeight: 4, confirmation: "breakdown" },
    "Rising Wedge": { rank: 24, weight: 8, candidateWeight: 4, confirmation: "breakdown" }
  });

  function assess(name, direction, evidence = {}) {
    const rule = RULES[name] || { rank: 30, weight: 8, candidateWeight: 4, confirmation: "volume-obv" };
    const sell = direction === "SELL";
    const volumeRatio = Number(evidence.volumeRatio) || 0;
    const volumeConfirmed = volumeRatio >= VOLUME_MIN;
    const obvConfirmed = evidence.obvConfirmed === true;
    const breakout = evidence.breakout === true;
    const breakdown = evidence.breakdown === true;
    let confirmed = false;
    if (sell) confirmed = breakdown && volumeConfirmed && obvConfirmed;
    else if (rule.confirmation === "breakout") confirmed = breakout && volumeConfirmed && obvConfirmed;
    else if (rule.confirmation === "breakdown") confirmed = breakout && volumeConfirmed && obvConfirmed;
    else confirmed = volumeConfirmed && obvConfirmed;

    const rawPoints = confirmed ? rule.weight : rule.candidateWeight;
    const points = Math.round(rawPoints * (sell ? SELL_WEIGHT_FACTOR : 1));
    let status, reason;
    if (confirmed) {
      status = "CONFIRMADO";
      reason = sell
        ? "rompimento para baixo com volume e OBV vendedor"
        : rule.confirmation === "breakout"
          ? "rompimento confirmado com volume e OBV comprador"
          : "volume e OBV confirmam a estrutura";
    } else if (sell) {
      status = "VENDA EM OBSERVAÇÃO";
      reason = "padrões de venda recebem peso menor e exigem rompimento para baixo, volume e OBV";
    } else if (name === "Three Rising Valleys") {
      status = "ALERTA PRINCIPAL";
      reason = "estrutura de fundos ascendentes; aguardar rompimento com volume e OBV";
    } else if (rule.confirmation === "breakout") {
      status = "AGUARDAR ROMPIMENTO";
      reason = "manter a estrutura em observação até fechar além do nível com volume e OBV";
    } else if (!volumeConfirmed && !obvConfirmed) {
      status = "AGUARDAR VOLUME E OBV";
      reason = "estrutura promissora, sem confirmação conjunta de volume e OBV";
    } else if (!volumeConfirmed) {
      status = "AGUARDAR VOLUME";
      reason = "OBV favorável, mas volume ainda abaixo de 1,2x a média recente";
    } else {
      status = "AGUARDAR OBV";
      reason = "volume favorável, mas OBV ainda não confirma";
    }
    return {
      name, direction, rank: rule.rank, points, confirmed, status, reason,
      volumeRatio: +volumeRatio.toFixed(3), volumeConfirmed, obvConfirmed,
      breakoutConfirmed: breakout && volumeConfirmed && obvConfirmed,
      breakdownConfirmed: breakdown && volumeConfirmed && obvConfirmed
    };
  }

  const MIN30_DISTANCE_MAX_PCT = 0.5;
  const MIN30_SCORE_MIN = 50;
  const MIN30_PATTERNS = Object.freeze({
    BUY: Object.freeze(["Three Rising Valleys", "Bull Pennant", "Bull Flag", "Double Bottom", "Falling Wedge"]),
    SELL: Object.freeze(["Bear Pennant", "Bear Flag", "Rectangle Distribution", "Double Top", "Rising Wedge"])
  });

  function assessMin30(input = {}) {
    const direction = input.direction === "SELL" ? "SELL" : input.direction === "BUY" ? "BUY" : null;
    const distance = Number(input.distancePct);
    if (input.fresh !== true || input.minimumValid !== true || !Number.isFinite(distance)) {
      return { eligible: false, reason: "mínima de 30 dias ausente, incompleta ou desatualizada" };
    }
    if (!(Number(input.candleCount) >= 700)) {
      return { eligible: false, reason: "histórico menor que 700 candles H1" };
    }
    if (Math.abs(distance) > MIN30_DISTANCE_MAX_PCT) {
      return { eligible: false, reason: "ativo fora da faixa de 0,50% da mínima de 30 dias" };
    }
    if (!direction) return { eligible: false, reason: "direção não identificada" };
    if (!MIN30_PATTERNS[direction].includes(String(input.pattern || ""))) {
      return { eligible: false, reason: "padrão não está entre os prioritários da direção" };
    }
    if (input.patternConfirmed !== true) {
      return { eligible: false, reason: "padrão ainda sem confirmação de volume/OBV ou rompimento" };
    }
    if (!(Number(input.score) >= MIN30_SCORE_MIN)) {
      return { eligible: false, reason: "score técnico abaixo de 50/100" };
    }
    return { eligible: true, reason: "mínima 30D e padrão direcional confirmados", direction, pattern: String(input.pattern), distancePct: distance };
  }

  return { VERSION: "lab-pattern-policy-v1", VOLUME_MIN, SELL_WEIGHT_FACTOR, RULES, assess, MIN30_DISTANCE_MAX_PCT, MIN30_SCORE_MIN, MIN30_PATTERNS, assessMin30 };
});
