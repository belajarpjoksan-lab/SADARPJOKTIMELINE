import { NextRequest, NextResponse } from 'next/server';
import { VisualRpmData, getFallbackVisualRpmData } from '@/lib/visual-rpm';
import { createGeminiClient, DEFAULT_GEMINI_MODEL, classifyGeminiError, logGeminiFallback } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  let rpmRawText = '';
  try {
    const body = await req.json();
    rpmRawText = body.rpmRawText || '';

    const ai = createGeminiClient();
    if (!ai) {
      return NextResponse.json({
        data: getFallbackVisualRpmData(rpmRawText),
        isFallback: true,
        warning: 'GEMINI_API_KEY belum diatur. Tampilan visual disusun menggunakan Mode Template otomatis.',
      });
    }

    const systemInstruction = `Anda adalah seorang desainer soal profesional sekaligus ahli pengembangan tampilan Rencana Pembelajaran Mendalam (RPM) visual interaktif A4.
Tugas Anda adalah membaca teks RPM yang diberikan dan menstrukturnya menjadi JSON yang sangat rapi dan lengkap untuk dirender ke dalam lembar visual A4 modern, clean, edukatif, dan ramah peserta didik (Gen Z).
PENTING:
- Pertahankan 100% substansi teks asli tanpa mengubah maksud redaksi sedikit pun.
- Susun ke dalam struktur JSON yang diminta.`;

    const userPrompt = `Tolong transformasikan teks RPM berikut menjadi JSON berstruktur lengkap sesuai skema:
${rpmRawText || 'Teks RPM standar SD Negeri Kalimantong'}`;

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const outputText = response.text || '{}';
    let parsed: Partial<VisualRpmData> = {};
    try {
      parsed = JSON.parse(outputText);
    } catch {
      const match = outputText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    // Merge with fallback defaults if any field is missing
    const fallback = getFallbackVisualRpmData(rpmRawText);
    const finalData: VisualRpmData = {
      identitas: { ...fallback.identitas, ...(parsed.identitas || {}) },
      identifikasi: { ...fallback.identifikasi, ...(parsed.identifikasi || {}) },
      desain: { ...fallback.desain, ...(parsed.desain || {}) },
      pengalamanBelajar: {
        kegiatanAwal: { ...fallback.pengalamanBelajar.kegiatanAwal, ...(parsed.pengalamanBelajar?.kegiatanAwal || {}) },
        kegiatanInti: parsed.pengalamanBelajar?.kegiatanInti?.length ? parsed.pengalamanBelajar.kegiatanInti : fallback.pengalamanBelajar.kegiatanInti,
        kegiatanPenutup: { ...fallback.pengalamanBelajar.kegiatanPenutup, ...(parsed.pengalamanBelajar?.kegiatanPenutup || {}) },
      },
      asesmen: { ...fallback.asesmen, ...(parsed.asesmen || {}) },
      tandaTangan: { ...fallback.tandaTangan, ...(parsed.tandaTangan || {}) },
      lampiran: {
        soalAwal: parsed.lampiran?.soalAwal?.length ? parsed.lampiran.soalAwal : fallback.lampiran.soalAwal,
        rubrikSikap: parsed.lampiran?.rubrikSikap?.length ? parsed.lampiran.rubrikSikap : fallback.lampiran.rubrikSikap,
        rubrikPengetahuan: parsed.lampiran?.rubrikPengetahuan?.length ? parsed.lampiran.rubrikPengetahuan : fallback.lampiran.rubrikPengetahuan,
        rubrikKeterampilan: parsed.lampiran?.rubrikKeterampilan?.length ? parsed.lampiran.rubrikKeterampilan : fallback.lampiran.rubrikKeterampilan,
        soalAkhir: parsed.lampiran?.soalAkhir?.length ? parsed.lampiran.soalAkhir : fallback.lampiran.soalAkhir,
        materiRingkas: { ...fallback.lampiran.materiRingkas, ...(parsed.lampiran?.materiRingkas || {}) },
        lkpd: { ...fallback.lampiran.lkpd, ...(parsed.lampiran?.lkpd || {}) },
      },
    };

    return NextResponse.json({
      data: finalData,
      isFallback: false,
    });
  } catch (error: unknown) {
    const errInfo = classifyGeminiError(error);
    logGeminiFallback('Visual RPM', errInfo);
    return NextResponse.json({
      data: getFallbackVisualRpmData(rpmRawText),
      isFallback: true,
      errorCode: errInfo.code,
      warning: errInfo.userMessage,
    });
  }
}
