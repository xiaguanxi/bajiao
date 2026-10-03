package com.vocast.app;
import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.util.*;
import java.util.zip.*;
import javax.xml.parsers.*;
import org.w3c.dom.*;

final class BookImporter {
    static String text(byte[] data){try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data)).toString();}catch(Exception e){return new String(data,Charset.forName("GB18030"));}}
    static Document xml(byte[] data) throws Exception {DocumentBuilderFactory f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(true);f.setFeature("http://xml.org/sax/features/external-general-entities",false);f.setFeature("http://xml.org/sax/features/external-parameter-entities",false);DocumentBuilder b=f.newDocumentBuilder();b.setEntityResolver((p,s)->new org.xml.sax.InputSource(new StringReader("")));return b.parse(new ByteArrayInputStream(data));}
    static String epub(byte[] data) throws Exception {
        Map<String,byte[]> files=new HashMap<>();int total=0;try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(data))){ZipEntry e;while((e=zip.getNextEntry())!=null){if(e.isDirectory())continue;byte[] raw=AudioFiles.read(zip,12*1024*1024);total+=raw.length;if(total>40*1024*1024)throw new IOException("EPUB 解压内容过大");files.put(e.getName(),raw);}}
        byte[] container=files.get("META-INF/container.xml");if(container==null)throw new IOException("EPUB 缺少目录");NodeList roots=xml(container).getElementsByTagNameNS("*","rootfile");if(roots.getLength()==0)throw new IOException("EPUB 缺少 package");String opf=((Element)roots.item(0)).getAttribute("full-path");byte[] opfBytes=files.get(opf);if(opfBytes==null)throw new IOException("EPUB package 丢失");Document doc=xml(opfBytes);String base=opf.contains("/")?opf.substring(0,opf.lastIndexOf('/')+1):"";Map<String,String> manifest=new HashMap<>();NodeList items=doc.getElementsByTagNameNS("*","item");for(int i=0;i<items.getLength();i++){Element e=(Element)items.item(i);manifest.put(e.getAttribute("id"),e.getAttribute("href"));}
        StringBuilder out=new StringBuilder();NodeList spine=doc.getElementsByTagNameNS("*","itemref");for(int i=0;i<spine.getLength();i++){String href=manifest.get(((Element)spine.item(i)).getAttribute("idref"));if(href==null)continue;String name=new java.net.URI(base+href.split("#")[0]).normalize().getPath();byte[] chapter=files.get(name);if(chapter==null)continue;Document ch=xml(chapter);NodeList body=ch.getElementsByTagNameNS("*","body");if(body.getLength()==0)continue;out.append("\n第").append(i+1).append("章\n");walk(body.item(0),out);}
        if(out.toString().trim().isEmpty())throw new IOException("无法解析 EPUB 正文，可能加密或格式不支持");return out.toString();
    }
    static void walk(Node node,StringBuilder text){String name=node.getLocalName();if("script".equals(name)||"style".equals(name))return;if(node.getNodeType()==Node.TEXT_NODE)text.append(node.getNodeValue());for(Node n=node.getFirstChild();n!=null;n=n.getNextSibling())walk(n,text);if(Arrays.asList("p","div","h1","h2","h3","br","li").contains(name))text.append('\n');}
}
