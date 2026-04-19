import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeWER, intToWords, normalize } from './compute-wer.js';

describe('normalize', () => {
  it('remove acentos (esta == está, três == tres)', () => {
    assert.deepEqual(normalize('está'), normalize('esta'));
    assert.equal(computeWER('Três semanas', 'tres semanas').errors, 0);
  });

  it('é case-insensitive (Maria == maria == MARIA)', () => {
    assert.deepEqual(normalize('Maria'), normalize('maria'));
    assert.deepEqual(normalize('MARIA'), normalize('maria'));
    assert.equal(computeWER('Boa Tarde DOUTOR', 'boa tarde doutor').errors, 0);
  });

  it('ignora pontuação (vírgula, ponto-final, exclamação, travessão)', () => {
    assert.equal(computeWER('Olha, doutor!', 'olha doutor').errors, 0);
    assert.equal(computeWER('Sim. Autorizo.', 'sim autorizo').errors, 0);
    assert.equal(computeWER('paciente — combinado?', 'paciente combinado').errors, 0);
  });

  it('converte dígitos simples para extenso (50 == cinquenta)', () => {
    assert.deepEqual(normalize('50'), ['cinquenta']);
    assert.deepEqual(normalize('33'), ['trinta', 'e', 'tres']);
    assert.equal(computeWER('50 miligramas', 'cinquenta miligramas').errors, 0);
  });

  it('converte dígitos compostos (150, 2022, 300)', () => {
    assert.deepEqual(normalize('150'), ['cento', 'e', 'cinquenta']);
    assert.deepEqual(normalize('2022'), ['dois', 'mil', 'e', 'vinte', 'e', 'dois']);
    assert.deepEqual(normalize('300'), ['trezentos']);
    assert.equal(intToWords(2150), 'dois mil cento e cinquenta');
    assert.equal(intToWords(1100), 'mil e cem');
  });

  it('unifica unidades mg, %, ml (50mg == cinquenta miligramas)', () => {
    assert.equal(computeWER('50mg', 'cinquenta miligramas').errors, 0);
    assert.equal(computeWER('50 mg', 'cinquenta miligramas').errors, 0);
    assert.equal(computeWER('100%', 'cem por cento').errors, 0);
    assert.equal(computeWER('5 ml', 'cinco mililitros').errors, 0);
  });

  it('canoniza CID-10 entre formas digit, ponto e extenso', () => {
    assert.deepEqual(normalize('F33.1'), normalize('F33 ponto 1'));
    assert.deepEqual(normalize('F33.1'), normalize('F 33 1'));
    assert.deepEqual(normalize('F33.1'), normalize('efe trinta e três ponto um'));
    assert.equal(computeWER('CID F33.1', 'cid efe trinta e tres ponto um').errors, 0);
    assert.equal(computeWER('F41.1', 'efe quarenta e um ponto um').errors, 0);
  });

  it('combina todas as regras numa frase clínica realista', () => {
    const ref = 'Vou prescrever sertralina 50mg pela manhã, CID F33.1';
    const hyp = 'vou prescrever sertralina cinquenta miligramas pela manha cid efe trinta e tres ponto um';
    assert.equal(computeWER(ref, hyp).errors, 0);
  });
});
