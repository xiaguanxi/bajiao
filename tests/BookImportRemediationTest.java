package com.vocast.app;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;
import java.io.*;
import java.util.zip.*;
public class BookImportRemediationTest {
 static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
 static void entry(ZipOutputStream z,String name,String text)throws Exception{z.putNextEntry(new ZipEntry(name));z.write(text.getBytes(StandardCharsets.UTF_8));z.closeEntry();}
 public static void main(String[] args)throws Exception{
  String text="第一章 开始\n中文正文，正常保留。\n第二章 继续\n最后的正文。";
  check(BookImporter.text(text.getBytes("GB18030")).equals(text),"GB18030 must survive");check(BookImporter.text(text.getBytes("UTF-8")).equals(text),"UTF-8 must survive");check(BookImporter.text(text.getBytes("UTF-16")).equals(text),"UTF-16 BOM must survive");
  byte[] good=(text.repeat(100)).getBytes("UTF-8"),bad=Arrays.copyOf(good,good.length+1);bad[bad.length-1]=(byte)0xff;check(BookImporter.encoding(bad).equals("UTF-8"),"one malformed byte must not recode a UTF-8 novel");check(BookImporter.text(bad).startsWith(text.repeat(100)),"valid characters are preserved");
  Path actual=Paths.get("artifacts/phone-ux-audit-20261014/full/second-original.txt");if(Files.exists(actual)){byte[] data=Files.readAllBytes(actual);check(BookImporter.encoding(data).equals("UTF-8"),"actual second novel is UTF-8");check(BookImporter.text(data).contains("第十四章"),"actual Chinese title remains readable");}
  try{BookImporter.xml("<!DOCTYPE a [<!ENTITY x SYSTEM 'file:///secret'>]><a>&x;</a>".getBytes("UTF-8"));throw new AssertionError("unsafe entities accepted");}catch(IOException expected){}
  ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(ZipOutputStream z=new ZipOutputStream(bytes)){
   entry(z,"META-INF/container.xml","<container><rootfiles><rootfile full-path='book.opf'/></rootfiles></container>");entry(z,"book.opf","<package><manifest><item id='a' href='a.xhtml'/><item id='b' href='b.xhtml'/></manifest><spine><itemref idref='b'/><itemref idref='a'/></spine></package>");entry(z,"a.xhtml","<!DOCTYPE html PUBLIC '-//W3C//DTD XHTML 1.1//EN' 'https://example.invalid/dtd'><html xmlns='http://www.w3.org/1999/xhtml'><body><p>甲章。</p></body></html>");entry(z,"b.xhtml","<html><body><p>乙章。</p><script>不导入</script></body></html>");
  }
  String epub=BookImporter.epub(bytes.toByteArray());check(epub.indexOf("乙章")<epub.indexOf("甲章"),"spine order");check(!epub.contains("不导入"),"script exclusion");
  String standard=BookImporter.epub(Files.readAllBytes(Paths.get("artifacts/phone-ux-audit-20261014/UX-Audit-EPUB-20261014.epub")));check(!standard.contains("第1章")&&!standard.contains("第2章"),"existing chapter headings must not gain empty synthetic chapters");check(standard.contains("第一章 夜间审计")&&standard.contains("第二章 清晨审计"),"actual EPUB headings");
  System.out.println("PASS: UTF-8/GB18030/UTF-16, damaged-byte preservation, actual novel, safe EPUB DTD, spine, existing heading preservation");
 }
}
