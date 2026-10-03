package com.vocast.app;
import java.io.*;import java.nio.charset.StandardCharsets;import java.security.*;import java.util.*;
public class NovelImportTest {
 public static void main(String[] args)throws Exception{File input=Arrays.stream(new File("books").listFiles()).filter(f->f.getName().endsWith(".txt")).findFirst().orElseThrow();long start=System.nanoTime();String text=BookImporter.text(AudioFiles.read(input,40*1024*1024));if(text.length()!=1206243||!text.contains("第0056 云腾致雨，露结为霜")||text.indexOf('\uFFFD')>=0)throw new AssertionError("Real GB18030 book import failed");System.out.println("PASS real native GB18030 import: "+text.length()+" characters, "+(System.nanoTime()-start)/1e6+" ms");}
}
