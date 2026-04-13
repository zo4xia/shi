// ROUTE: Daily Memory Extraction - File Archiving Functions - No authentication
import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import type { IdentityKey } from '../../src/main/memory/identityMemoryManager';

// API: File to archive
export interface FileToArchive {
  path: string;
  filename: string;
  size: number;
}

// API: File archiving result
export interface ArchiveResult {
  archivedFiles: number;
  archivedSize: number;
  errors: string[];
}

// API: Archive daily files
export async function archiveDailyFiles(backupPath: string): Promise<ArchiveResult> {
  // PROGRESS: 文件归档 0% - 开始执行
  console.log(`[FileArchiver] 开始文件归档，备份路径: ${backupPath}`);

  const results: ArchiveResult = {
    archivedFiles: 0,
    archivedSize: 0,
    errors: [],
  };

  try {
    // CHECKPOINT: Get all active identities
    // ROUTE: Daily Memory Extraction - Get All Identities - No authentication
    // API: getAllIdentities - Get all active identities
    const identities = await getAllIdentities();

    if (identities.length === 0) {
      console.log('[FileArchiver] 没有发现激活的身份');
      return results;
    }

    // CHECKPOINT: Get today's date for folder structure
    // FLOW: Daily Memory Extraction - Create archive folder structure
    const today = new Date();
    const dateFolder = today.toISOString().slice(0, 10); // YYYY-MM-DD

    // FLOW: Daily Memory Extraction - Archive files for each identity
    for (let i = 0; i < identities.length; i++) {
      const identity = identities[i];
      const progress = Math.round(((i + 1) / identities.length) * 100);

      try {
        // PROGRESS: 文件归档 ${progress}% - 处理归档目录: ${identity.agentRoleKey}_${identity.modelId}
        console.log(`[FileArchiver] 处理归档目录: ${identity.agentRoleKey}_${identity.modelId}`);

        // CHECKPOINT: Scan conversation files
        // ROUTE: Daily Memory Extraction - Scan Files - No authentication
        // API: scanConversationFiles - Scan conversation files for this identity
        const filesToArchive = await scanConversationFiles(identity);

        if (filesToArchive.length === 0) {
          console.log(`[FileArchiver] 归档目录 ${identity.agentRoleKey}_${identity.modelId} 没有需要归档的文件`);
          continue;
        }

        console.log(`[FileArchiver] 发现 ${filesToArchive.length} 个文件需要归档`);

        // CHECKPOINT: Create archive directory
        // ROUTE: Daily Memory Extraction - Create Archive Directory - No authentication
        // API: fs.mkdir - Create archive directory
        const archiveDir = path.join(
          backupPath,
          `${identity.agentRoleKey}_${identity.modelId}`,
          dateFolder
        );

        await fs.promises.mkdir(archiveDir, { recursive: true });
        console.log(`[FileArchiver] 创建归档目录: ${archiveDir}`);

        // CHECKPOINT: Archive each file
        // FLOW: Daily Memory Extraction - Copy and delete files
        for (const file of filesToArchive) {
          try {
            const sourcePath = file.path;
            const targetPath = path.join(archiveDir, file.filename);

            // CHECKPOINT: Copy file to archive directory
            // ROUTE: Daily Memory Extraction - Copy File - No authentication
            // API: fs.copyFile - Copy file to archive directory
            await fs.promises.copyFile(sourcePath, targetPath);
            console.log(`[FileArchiver] 归档文件: ${sourcePath} -> ${targetPath}`);

            // CHECKPOINT: Delete original file
            // ROUTE: Daily Memory Extraction - Delete File - No authentication
            // API: fs.unlink - Delete original file
            await fs.promises.unlink(sourcePath);
            console.log(`[FileArchiver] 删除原文件: ${sourcePath}`);

            results.archivedFiles++;
            results.archivedSize += file.size;
          } catch (error) {
            const errorMsg = `文件 ${file.path} 归档失败: ${error instanceof Error ? error.message : String(error)}`;
            results.errors.push(errorMsg);
            console.error(`[FileArchiver] ${errorMsg}`);
          }
        }
      } catch (error) {
        const errorMsg = `归档目录 ${identity.agentRoleKey}_${identity.modelId} 归档失败: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errorMsg);
        console.error(`[FileArchiver] ${errorMsg}`);
      }
    }

    // PROGRESS: 文件归档 100% - 完成
    console.log(`[FileArchiver] 文件归档完成: ${results.archivedFiles} 个文件 (总计 ${(results.archivedSize / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    const errorMsg = `文件归档失败: ${error instanceof Error ? error.message : String(error)}`;
    results.errors.push(errorMsg);
    console.error(`[FileArchiver] ${errorMsg}`);
  }

  return results;
}

// API: Scan conversation files
async function scanConversationFiles(identity: IdentityKey): Promise<FileToArchive[]> {
  // CHECKPOINT: Initialize file map for deduplication
  const files = new Map<string, { filename: string; size: number }>();

  // CHECKPOINT: Get all messages for this identity
  // ROUTE: Daily Memory Extraction - Get Identity Messages - No authentication
  // API: getIdentityMessages - Get all messages for this identity
  const messages = await getIdentityMessages(identity);

  // CHECKPOINT: Extract files from message metadata
  // FLOW: Daily Memory Extraction - Extract files from metadata
  for (const message of messages) {
    // CHECKPOINT: Check metadata for file_path field
    if (message.metadata) {
      const metadata = JSON.parse(message.metadata);

      // CHECKPOINT: Extract file_path from metadata
      if (metadata.file_path) {
        const filePath = metadata.file_path;
        const filename = path.basename(filePath);
        const stats = await fs.promises.stat(filePath).catch(() => null);

        if (stats && stats.isFile()) {
          files.set(filePath, { filename, size: stats.size });
        }
      }

      // CHECKPOINT: Extract attachments from metadata
      if (metadata.attachments && Array.isArray(metadata.attachments)) {
        for (const attachment of metadata.attachments) {
          const filePath = attachment.path || attachment.file_path;
          if (filePath) {
            const filename = path.basename(filePath);
            const stats = await fs.promises.stat(filePath).catch(() => null);

            if (stats && stats.isFile()) {
              files.set(filePath, { filename, size: stats.size });
            }
          }
        }
      }
    }
  }

  // CHECKPOINT: Extract files from conversation content using regex
  // FLOW: Daily Memory Extraction - Extract files from content
  for (const message of messages) {
    const filePatterns = [
      /(?:文件|file)[:：]\s*([^\s]+\.[a-zA-Z0-9]+)/gi,
      /(?:附件|attachment)[:：]\s*([^\s]+\.[a-zA-Z0-9]+)/gi,
      /(?:上传|upload)[:：]\s*([^\s]+\.[a-zA-Z0-9]+)/gi,
    ];

    for (const pattern of filePatterns) {
      const matches = message.content.matchAll(pattern);
      for (const match of matches) {
        const filePath = match[1];
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(getProjectRoot(), filePath);

        const filename = path.basename(absolutePath);
        const stats = await fs.promises.stat(absolutePath).catch(() => null);

        if (stats && stats.isFile()) {
          files.set(absolutePath, { filename, size: stats.size });
        }
      }
    }
  }

  // CHECKPOINT: Convert map to array
  return Array.from(files.entries()).map(([filePath, info]) => ({
    path: filePath,
    filename: info.filename,
    size: info.size,
  }));
}

// API: Get all messages for an identity
async function getIdentityMessages(
  identity: IdentityKey
): Promise<Array<{ content: string; metadata: string | null }>> {
  // CHECKPOINT: Load cowork store
  // ROUTE: Daily Memory Extraction - Load Cowork Store - No authentication
  // API: CoworkStore.listSessions - List all sessions for this identity

  // TODO: Implement session and message retrieval
  // For now, return empty array
  console.log('[FileArchiver] 会话和消息检索暂未实现，返回空数组');
  return [];
}

// API: Get all active identities
async function getAllIdentities(): Promise<IdentityKey[]> {
  // CHECKPOINT: Load identities from identity_thread_24h table
  // ROUTE: Daily Memory Extraction - Get All Identities - No authentication
  // API: identityMemoryManager.listIdentities - List all identities from 24h cache
  const { identityMemoryManager } = await import('../../src/main/memory/identityMemoryManager');
  const identities = await identityMemoryManager.listIdentities();
  return identities;
}
