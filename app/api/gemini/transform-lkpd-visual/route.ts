import { Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { VisualLkpdData, getFallbackVisualLkpdData, parseRawLkpdToVisual } from '@/lib/visual-lkpd';
import { createGeminiClient, DEFAULT_GEMINI_MODEL, classifyGeminiError, logGeminiFallback } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  let rawLkpdText = '';
  try {
    const body = await req.json();
    rawLkpdText = body.rawLkpdText || '';

    const ai = createGeminiClient();
    if (!ai || !rawLkpdText.trim()) {
      return NextResponse.json({
        data: parseRawLkpdToVisual(rawLkpdText),
        isFallback: true,
        warning: !ai
          ? 'GEMINI_API_KEY belum diatur. Tampilan visual disusun menggunakan Mode Template otomatis.'
          : undefined,
      });
    }

    const systemInstruction = `Anda adalah desainer pembelajaran profesional sekaligus ahli dalam mengembangkan LKPD interaktif berbasis visual A4 Portrait untuk peserta didik.
Tugas Anda adalah membaca teks lampiran LKPD yang diberikan dan menstrukturnya ke dalam JSON visual interaktif bergaya modern, clean, edukatif, dan ramah Gen Z.
PENTING:
- Seluruh isi teks, soal, instruksi, dan materi dalam LKPD harus DIPERTAHANKAN 100% SAMA PERSIS dengan teks asli tanpa ada pengurangan, penambahan, ataupun perubahan redaksi.
- Anda hanya menstrukturkan penyajiannya menjadi visual: menentukan tipe bagian (stimulus, soal isian, mencocokkan, kasus nyata, refleksi, checklist), menambahkan ikon pendukung (📌, ✏️, 💡, 🔍, 🎯, ⭐), dan memilih warna kartu pastel lembut (cyan, amber, emerald, purple, rose, indigo).`;

    const userPrompt = `Tolong strukturkan naskah LKPD berikut ke dalam format JSON visual interaktif A4 tanpa mengubah redaksi teks sedikit pun:
${rawLkpdText}`;

    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            identitas: {
              type: Type.OBJECT,
              properties: {
                judulLkpd: { type: Type.STRING },
                mataPelajaran: { type: Type.STRING },
                kelasFase: { type: Type.STRING },
                topikMateri: { type: Type.STRING },
                alokasiWaktu: { type: Type.STRING },
                sekolah: { type: Type.STRING },
                petunjukUmum: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['judulLkpd', 'mataPelajaran', 'kelasFase', 'topikMateri', 'alokasiWaktu'],
            },
            bagianList: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  tipe: { type: Type.STRING },
                  judulBagian: { type: Type.STRING },
                  ikon: { type: Type.STRING },
                  warnaCard: { type: Type.STRING },
                  instruksi: { type: Type.STRING },
                  teksKonten: { type: Type.STRING },
                  ilustrasiDeskripsi: { type: Type.STRING },
                  butirSoal: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        nomor: { type: Type.STRING },
                        pertanyaan: { type: Type.STRING },
                        kunciJawabanRef: { type: Type.STRING },
                        ruangJawabanHeight: { type: Type.STRING },
                      },
                      required: ['nomor', 'pertanyaan'],
                    },
                  },
                  itemMencocokkan: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        kiri: { type: Type.STRING },
                        kanan: { type: Type.STRING },
                      },
                      required: ['kiri', 'kanan'],
                    },
                  },
                  itemChecklist: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['id', 'tipe', 'judulBagian', 'ikon', 'warnaCard'],
              },
            },
            penutup: {
              type: Type.OBJECT,
              properties: {
                pesanPenyemangat: { type: Type.STRING },
                catatanGuru: { type: Type.STRING },
                titimangsa: { type: Type.STRING },
                namaGuru: { type: Type.STRING },
              },
            },
          },
          required: ['identitas', 'bagianList'],
        },
      },
    });

    const outputText = response.text || '{}';
    let parsed: Partial<VisualLkpdData> = {};
    try {
      parsed = JSON.parse(outputText);
    } catch {
      const match = outputText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    const fallback = parseRawLkpdToVisual(rawLkpdText);
    const finalData: VisualLkpdData = {
      identitas: {
        ...fallback.identitas,
        ...(parsed.identitas || {}),
        petunjukUmum: parsed.identitas?.petunjukUmum?.length ? parsed.identitas.petunjukUmum : fallback.identitas.petunjukUmum,
      },
      bagianList: parsed.bagianList && parsed.bagianList.length > 0 ? (parsed.bagianList as any) : fallback.bagianList,
      penutup: {
        ...fallback.penutup,
        ...(parsed.penutup || {}),
      },
    };

    return NextResponse.json({
      data: finalData,
      isFallback: false,
    });
  } catch (err: unknown) {
    const errInfo = classifyGeminiError(err);
    logGeminiFallback('Visual LKPD', errInfo);
    return NextResponse.json({
      data: rawLkpdText.trim() ? parseRawLkpdToVisual(rawLkpdText) : getFallbackVisualLkpdData(),
      isFallback: true,
      errorCode: errInfo.code,
      warning: errInfo.userMessage,
    });
  }
}
