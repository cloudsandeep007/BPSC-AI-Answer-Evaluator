import { wordCount } from "../../stageA";
import {
  AIProvider,
  AIStructuredRequest,
  AIStructuredResponse,
  AITranscriptionRequest,
  AITranscriptionResponse,
} from "../gateway";

export class MockProvider implements AIProvider {
  public readonly name = "mock-provider";

  public async callStructured<T>(req: AIStructuredRequest): Promise<AIStructuredResponse<T>> {
    let mockData: any;

    if (req.feature === "stage0") {
      mockData = {
        question:
          "बिहार में पंचायती राज संस्थाओं में 50% महिला आरक्षण के सामाजिक एवं राजनीतिक प्रभावों का मूल्यांकन कीजिए।",
        topic: "Polity",
        paper: "GS Paper 2",
        marks: 8,
        word_limit: 125,
        expected_points: [
          {
            point: "बिहार पंचायती राज अधिनियम 2006 द्वारा 50% आरक्षण लागू करने वाला पहला राज्य।",
            weight: 1.0,
            cues: ["2006 अधिनियम", "50% आरक्षण", "पहला राज्य"],
            source: {
              type: "ncert",
              book: "Democratic Politics - II",
              classNum: 10,
              chapter: "Gender, Religion and Caste",
              label: "NCERT Class 10 Political Science, Ch. 4 (Gender, Religion and Caste)",
            },
          },
          {
            point: "महिला नेतृत्व में वृद्धि और जमीनी स्तर पर सशक्तिकरण।",
            weight: 1.0,
            cues: ["सशक्तिकरण", "महिला मुखिया", "निर्णय क्षमता"],
            source: {
              type: "general_knowledge",
              detail: "Bihar Economic Survey 2023-24 (Rural Development & Panchayati Raj)",
              label: "Bihar Economic Survey 2023-24 (Rural Development & Panchayati Raj)",
            },
          },
        ],
      };
    } else if (req.feature === "stageB") {
      mockData = {
        dimensions: {
          content: "strong",
          directive: "strong",
          structure: "average",
          relevance: "strong",
        },
        dimension_notes: {
          content: "मुख्य बिंदुओं का अच्छा समावेश।",
          directive: "मूल्यांकन निर्देश का उचित पालन।",
          structure: "प्रस्तावना और निष्कर्ष को और स्पष्ट किया जा सकता था।",
          relevance: "विषय से पूरी तरह प्रासंगिक।",
        },
        specificity: "average",
        points_found: [
          {
            key_index: 0,
            evidence: "बिहार पंचायती राज अधिनियम 2006 का उल्लेख किया गया।",
          },
        ],
        points_missed: [
          {
            key_index: 1,
            why_it_matters: "महिला मुखिया और जमीनी प्रभाव का विस्तृत विश्लेषण छूट गया।",
          },
        ],
        feedback: "उत्तर समग्र रूप से अच्छा है। तथ्यों की सटीकता बनाए रखें।",
        todo: ["निष्कर्ष को समाधानोन्मुखी बनाएं।", "योजनाओं के नाम स्पष्ट लिखें।"],
      };
    } else {
      mockData = { success: true, mock: true };
    }

    return {
      data: mockData as T,
      rawText: JSON.stringify(mockData),
      provider: this.name,
      model: "mock-model",
      latencyMs: 15,
      usage: {
        inputTokens: 150,
        outputTokens: 250,
      },
      groundingSources: [],
    };
  }

  public async transcribe(req: AITranscriptionRequest): Promise<AITranscriptionResponse> {
    const mockTranscript =
      "बिहार में पंचायती राज अधिनियम 2006 के तहत महिलाओं को 50 प्रतिशत आरक्षण दिया गया। " +
      "इससे ग्रामीण स्तर पर महिलाओं की भागीदारी बढ़ी है और सामाजिक न्याय सुनिश्चित हुआ है।";

    return {
      transcript: mockTranscript,
      confidence: 0.95,
      wordCount: wordCount(mockTranscript),
      provider: this.name,
      model: "mock-vision-model",
      latencyMs: 25,
      usage: {
        inputTokens: 300,
        outputTokens: 50,
      },
    };
  }
}
