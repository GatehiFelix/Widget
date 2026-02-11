import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import fs from "fs/promises";
import PQueue from "p-queue";
import crypto from "crypto";
import mammoth from "mammoth";
import * as cheerio from "cheerio";
import axios from "axios";  
import Papa from "papaparse";

import { config } from "#config/index.js";
import logger from "#utils/logger.js";


const processingQueue = new PQueue({
  concurrency: 3,
  timeout: 30000,
});

const documentCache = new Map();
const CACHE_TTL = 3600000; 

const MAX_FILE_SIZE = 50 * 1024 * 1024;  // 50MB
const MAX_TEXT_SIZE = 10 * 1024 * 1024;  // 10MB

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx', '.doc', '.html', '.htm', '.csv', '.png', '.jpg', '.jpeg', '.mp3', '.wav'];
// Gemini processors
import { geminiImageToCaption } from "../core/embeddings/modalities/geminiImageProcessor.js";
import { geminiAudioToText } from "../core/embeddings/modalities/geminiAudioProcessor.js";
  // Helper: get Gemini API key
  const getGeminiApiKey = () => {
    return process.env.GOOGLE_API_KEY || config.google?.apiKey;
  };
  // Load image file and caption with Gemini
  const loadImage = async (filePath) => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error("GOOGLE_API_KEY required for image captioning");
    const { size } = await validateFile(filePath, MAX_FILE_SIZE);
    logger.info(`🖼️ Loading image: ${path.basename(filePath)} (${(size / 1024).toFixed(2)}KB)`);
    const fileBuffer = await fs.readFile(filePath);
    const caption = await geminiImageToCaption(fileBuffer, apiKey);
    logger.info(`Gemini caption: ${caption}`);
    return [{
      pageContent: caption,
      metadata: { source: filePath, modality: "image" }
    }];
  };

  // Load audio file and transcribe with Gemini/Google Speech
  const loadAudio = async (filePath) => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error("GOOGLE_API_KEY required for audio transcription");
    const { size } = await validateFile(filePath, MAX_FILE_SIZE);
    logger.info(`🔊 Loading audio: ${path.basename(filePath)} (${(size / 1024).toFixed(2)}KB)`);
    const fileBuffer = await fs.readFile(filePath);
    const transcript = await geminiAudioToText(fileBuffer, apiKey);
    logger.info(`Gemini transcript: ${transcript}`);
    return [{
      pageContent: transcript,
      metadata: { source: filePath, modality: "audio" }
    }];
  };

/**
 * Creates a document service for loading and processing documents
 * @param {Object} options - Configuration options
 * @returns {Object} Document service with methods
 */
export const createDocumentService = (options = {}) => {
  const chunkSize = options.chunkSize || config.rag.chunkSize;
  const chunkOverlap = options.chunkOverlap || config.rag.chunkOverlap;

  // Auto-cleanup stale cache entries
  const cleanupCache = () => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of documentCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        documentCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`🧹 Cleaned ${cleaned} stale cache entries`);
    }
  };

  //  cleanup every 10 minutes
  setInterval(cleanupCache, 10 * 60 * 1000);

  //  Reusable cache getter
  const getCachedDocument = (cacheKey) => {
    if (documentCache.has(cacheKey)) {
      const cached = documentCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug(`📦 Cache HIT: ${cacheKey.substring(0, 16)}...`);
        return cached.documents;
      } else {
        documentCache.delete(cacheKey);
      }
    }
    return null;
  };

  // Reusable cache setter
  const setCachedDocument = (cacheKey, documents) => {
    documentCache.set(cacheKey, {
      documents,
      timestamp: Date.now(),
    });
    logger.debug(` Cached: ${cacheKey.substring(0, 16)}...`);
  };

  // File hashing for deduplication
  const hashFile = async (filePath) => {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  };

  // Better file validation
  const validateFile = async (filePath, maxSize = MAX_FILE_SIZE) => {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Check extension
      const ext = path.extname(filePath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
      }
      
      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > maxSize) {
        throw new Error(
          `File size ${(stats.size / (1024 * 1024)).toFixed(2)}MB exceeds limit of ${(maxSize / (1024 * 1024)).toFixed(2)}MB`
        );
      }

      return { size: stats.size, ext };
    } catch (error) {
      logger.error(`Failed to validate file ${filePath}:`, error.message);
      throw error;
    }
  };

  /**
   * Load a PDF document
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<Array>} Array of document objects
   */
  const loadPDF = async (filePath) => {
    try {
      const { size } = await validateFile(filePath, MAX_FILE_SIZE);
      logger.info(` Loading PDF: ${path.basename(filePath)} (${(size / (1024 * 1024)).toFixed(2)}MB)`);

      const fileHash = await hashFile(filePath);
      const cacheKey = `pdf_${fileHash}`;

      // Use reusable cache getter
      const cached = getCachedDocument(cacheKey);
      if (cached) return cached;

      const documents = await processingQueue.add(async () => {
        try {
          const loader = new PDFLoader(filePath);
          const docs = await loader.load();
          logger.info(`📑 Loaded ${docs.length} pages from PDF`);
          return docs;
        } catch (error) {
          logger.error(`PDF parsing error: ${error.message}`);
          throw new Error(`Failed to parse PDF: ${error.message}`);
        }
      });

      // ✅ Use reusable cache setter
      setCachedDocument(cacheKey, documents);
      return documents;

    } catch (error) {
      logger.error(`Failed to load PDF ${filePath}:`, error.message);
      throw error;
    }
  };

  /**
   * Load a text file
   * @param {string} filePath - Path to text file
   * @returns {Promise<Array>} Array with single document object
   */
  const loadTextFile = async (filePath) => {
    try {
      const { size } = await validateFile(filePath, MAX_TEXT_SIZE);
      logger.info(`📝 Loading text: ${path.basename(filePath)} (${(size / 1024).toFixed(2)}KB)`);

      const fileHash = await hashFile(filePath);
      const cacheKey = `text_${fileHash}`;

      const cached = getCachedDocument(cacheKey);
      if (cached) return cached;

      const documents = await processingQueue.add(async () => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return [{ 
            pageContent: content, 
            metadata: { source: filePath } 
          }];
        } catch (error) {
          throw new Error(`Failed to read text file: ${error.message}`);
        }
      });

      setCachedDocument(cacheKey, documents);
      return documents;

    } catch (error) {
      logger.error(`Failed to load text file ${filePath}:`, error.message);
      throw error;
    }
  };

  /**
   * Load a DOCX file
   * @param {string} filePath - Path to DOCX file
   * @returns {Promise<Array>} Array with single document object
   */
  const loadDocx = async (filePath) => {
    try {
      const { size } = await validateFile(filePath, MAX_FILE_SIZE);
      logger.info(` Loading DOCX: ${path.basename(filePath)} (${(size / (1024 * 1024)).toFixed(2)}MB)`);

      const fileHash = await hashFile(filePath);
      const cacheKey = `docx_${fileHash}`;

      const cached = getCachedDocument(cacheKey);
      if (cached) return cached;

      const documents = await processingQueue.add(async () => {
        try {
          const result = await mammoth.extractRawText({ path: filePath });
          
          if (!result.value || result.value.trim().length === 0) {
            throw new Error('DOCX file appears to be empty or unreadable');
          }
          
          return [{
            pageContent: result.value,
            metadata: { 
              source: filePath,
              warnings: result.messages?.length || 0
            }
          }];
        } catch (error) {
          throw new Error(`Failed to parse DOCX: ${error.message}`);
        }
      });

      setCachedDocument(cacheKey, documents);
      return documents;

    } catch (error) {
      logger.error(`Failed to load DOCX ${filePath}:`, error.message);
      throw error;
    }
  };


  /**
   * @description Load a CSV file
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<Array>} Array with single document object
   * 
   */

    const loadCsv = async (filePath) => {
    try {
      const { size } = await validateFile(filePath, MAX_TEXT_SIZE);
      logger.info(` Loading CSV: ${path.basename(filePath)} (${(size / 1024).toFixed(2)}KB)`);

      const fileHash = await hashFile(filePath);
      const cacheKey = `csv_${fileHash}`;

      const cached = getCachedDocument(cacheKey);
      if (cached) return cached;

      const documents = await processingQueue.add(async () => {
        try {
          const raw = await fs.readFile(filePath, 'utf-8');
          const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
          if (parsed.errors && parsed.errors.length) {
            logger.warn(`CSV parse warnings: ${parsed.errors.length} errors`);
          }

          // Convert each row into a simple text representation
          const rows = parsed.data.map((row, i) => ({
            pageContent: `Row ${i + 1}: ${Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
            metadata: { source: filePath, row: i + 1 }
          }));

          if (rows.length === 0) {
            throw new Error('CSV file contains no readable rows');
          }

          return rows;
        } catch (error) {
          throw new Error(`Failed to parse CSV: ${error.message}`);
        }
      });

            setCachedDocument(cacheKey, documents);
      return documents;
    } catch (error) {
      logger.error(`Failed to load CSV ${filePath}:`, error.message);
      throw error;
    }
  };

  /**
   * Load an HTML file
   * @param {string} filePath - Path to HTML file
   * @returns {Promise<Array>} Array with single document object
   */
  const loadHtml = async (filePath) => {
    try {
      const { size } = await validateFile(filePath, MAX_FILE_SIZE);
      logger.info(`🌐 Loading HTML: ${path.basename(filePath)} (${(size / 1024).toFixed(2)}KB)`);

      const fileHash = await hashFile(filePath);
      const cacheKey = `html_${fileHash}`;

      const cached = getCachedDocument(cacheKey);
      if (cached) return cached;

      const documents = await processingQueue.add(async () => {
        try {
          const html = await fs.readFile(filePath, 'utf-8');
          const $ = cheerio.load(html);
          
          // Remove script and style tags
          $('script, style').remove();
          const text = $('body').text().replace(/\s+/g, ' ').trim();

          if (!text) {
            throw new Error('HTML file contains no readable text');
          }

          return [{
            pageContent: text,
            metadata: { 
              source: filePath,
              title: $('title').text() || path.basename(filePath)
            }
          }];
        } catch (error) {
          throw new Error(`Failed to parse HTML: ${error.message}`);
        }
      });

      setCachedDocument(cacheKey, documents);
      return documents;

    } catch (error) {
      logger.error(`Failed to load HTML ${filePath}:`, error.message);
      throw error;
    }
  };

  /**
   * Load content from a URL
   * @param {string} url - URL to load
   * @returns {Promise<Array>} Array with single document object
   */
  const loadUrl = async (url) => {
    try {
      logger.info(` Loading URL: ${url}`);

      const cacheKey = `url_${crypto.createHash('sha256').update(url).digest('hex')}`;

      const cached = getCachedDocument(cacheKey);
      if (cached) return cached;

      const documents = await processingQueue.add(async () => {
        try {
          const { data } = await axios.get(url, {
            timeout: 10000,
            maxContentLength: MAX_FILE_SIZE,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; RAGBot/1.0)'
            }
          });
          
          const $ = cheerio.load(data);
          $('script, style').remove();
          const text = $('body').text().replace(/\s+/g, ' ').trim();

          if (!text) {
            throw new Error('URL contains no readable text');
          }

          return [{
            pageContent: text,
            metadata: { 
              source: url,
              title: $('title').text() || url
            }
          }];
        } catch (error) {
          if (error.code === 'ENOTFOUND') {
            throw new Error(`URL not found: ${url}`);
          }
          throw new Error(`Failed to fetch URL: ${error.message}`);
        }
      });

      setCachedDocument(cacheKey, documents);
      return documents;

    } catch (error) {
      logger.error(`Failed to load URL ${url}:`, error.message);
      throw error;
    }
  };

  /**
   * Load a document (supports multiple formats)
   * @param {string} filePath - Path to document
   * @returns {Promise<Array>} Array of document objects
   */
  const loadDocument = async (filePath) => {
    // Validate file exists and has allowed extension
    const { ext } = await validateFile(filePath);
    
    // Route to appropriate loader
    switch (ext) {
      case '.pdf':
        return await loadPDF(filePath);
      case '.txt':
      case '.md':
        return await loadTextFile(filePath);
      case '.docx':
      case '.doc':
        return await loadDocx(filePath);
      case '.html':
      case '.htm':
        return await loadHtml(filePath);
      case '.csv':
        return await loadCsv(filePath);
      case '.png':
      case '.jpg':
      case '.jpeg':
        return await loadImage(filePath);
      case '.mp3':
      case '.wav':
        return await loadAudio(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  };

  /**
   * Split documents into chunks
   * @param {Array} documents - Array of document objects
   * @returns {Promise<Array>} Array of document chunks
   */
  const splitDocuments = async (documents) => {
    try {
      logger.info(` Splitting ${documents.length} document(s)`);
      
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ["\n\n", "\n", ". ", " ", ""],  // Better splitting
      });
      
      const chunks = await textSplitter.splitDocuments(documents);
      logger.info(` Created ${chunks.length} chunks`);
      
      return chunks;
    } catch (error) {
      logger.error('Failed to split documents:', error);
      throw error;
    }
  };

  /**
   * Process a document (load and split)
   * @param {string} filePath - Path to document
   * @param {Object} metadata - Additional metadata
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array>} Array of processed chunks
   */
  const processDocument = async (filePath, metadata = {}, onProgress) => {
    try {
      onProgress?.({ stage: 'loading', progress: 0 });
      
      const documents = await loadDocument(filePath);
      
      onProgress?.({ stage: 'splitting', progress: 50 });
      
      const chunks = await splitDocuments(documents);
      
      onProgress?.({ stage: 'complete', progress: 100 });
      
      // Add custom metadata to chunks
      return chunks.map((chunk, index) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          ...metadata,
          chunk_index: index,
          total_chunks: chunks.length,
          processed_at: new Date().toISOString(),
        }
      }));
    } catch (error) {
      onProgress?.({ stage: 'error', progress: 0, error: error.message });
      logger.error('Document processing failed:', error);
      throw error;
    }
  };

  /**
   * Clear document cache
   */
  const clearCache = () => {
    const size = documentCache.size;
    documentCache.clear();
    logger.info(`Cleared document cache (${size} entries removed)`);
  };

  /**
   * Get cache statistics
   */
  const getCacheStats = () => {
    const now = Date.now();
    let active = 0;
    let stale = 0;

    for (const [key, value] of documentCache.entries()) {
      if (now - value.timestamp < CACHE_TTL) {
        active++;
      } else {
        stale++;
      }
    }

    return {
      total: documentCache.size,
      active,
      stale,
      ttl: CACHE_TTL,
    };
  };

  /**
   * Get processing queue status
   */
  const getQueueStatus = () => {
    return {
      pending: processingQueue.pending,
      size: processingQueue.size,
      concurrency: processingQueue.concurrency,
    };
  };

  return {
    loadPDF,
    loadTextFile,
    loadDocx,
    loadCsv,
    loadHtml,
    loadUrl,
    loadDocument,
    splitDocuments,
    processDocument,
    clearCache,
    getCacheStats,
    getQueueStatus,
    hashFile,
    validateFile,  
  };
};

export default createDocumentService;