package com.vocast.app;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
public class NativeFilesTest {
 static void require(boolean condition,String text){if(!condition)throw new AssertionError(text);}
 public static void main(String[] args)throws Exception{
  File output=new File("artifacts/native");output.mkdirs();AudioFiles files=new AudioFiles(output);
  byte[] input=Files.readAllBytes(Paths.get("artifacts/live/completed-chapter.wav"));
  AudioFiles.Wave wave=AudioFiles.parse(input);String id=files.save(input,"wav").getString("id");
  String merged=files.merge(Arrays.asList(id,id)).getString("id");
  require(Math.abs(AudioFiles.parse(Files.readAllBytes(files.get(merged).toPath())).duration()-2*wave.duration())<.001,"merge duration");
  try{files.get("../secret.wav");throw new AssertionError("path traversal accepted");}catch(Exception expected){}
  try{AudioFiles.parse(Arrays.copyOf(input,25));throw new AssertionError("truncated WAV accepted");}catch(Exception expected){}
  String novel="第一章\n她说：你好。";require(BookImporter.text(novel.getBytes("GB18030")).equals(novel),"GB18030 import");
  ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(ZipOutputStream zip=new ZipOutputStream(bytes)){
   entry(zip,"META-INF/container.xml","<container><rootfiles><rootfile full-path='OEBPS/content.opf'/></rootfiles></container>");
   entry(zip,"OEBPS/content.opf","<package><manifest><item id='b' href='two.xhtml'/><item id='a' href='one.xhtml'/></manifest><spine><itemref idref='a'/><itemref idref='b'/></spine></package>");
   entry(zip,"OEBPS/one.xhtml","<html><body><p>先读这一章。</p><script>不读脚本</script></body></html>");
   entry(zip,"OEBPS/two.xhtml","<html><body><p>然后第二章。</p></body></html>");
  }String book=BookImporter.epub(bytes.toByteArray());require(book.indexOf("先读")<book.indexOf("然后"),"EPUB spine order");require(!book.contains("不读脚本"),"script stripping");
  System.out.println("PASS native Java: live WAV parse/merge, invalid file rejection, GB18030, EPUB spine and script exclusion");
 }
 static void entry(ZipOutputStream zip,String name,String text)throws Exception{zip.putNextEntry(new ZipEntry(name));zip.write(text.getBytes("UTF-8"));zip.closeEntry();}
}
